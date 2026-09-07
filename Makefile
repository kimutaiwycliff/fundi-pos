# =============================================================================
# Fundi POS — VPS bootstrap, deploy, and disaster-recovery commands
# =============================================================================
# Narrative version of everything below: docker/RESTORE.md.
#
# Every target that touches a server does so over SSH using the same
# key/host/user/path convention as .github/workflows/deploy.yml's own
# DEPLOY_SSH_KEY/DEPLOY_HOST/DEPLOY_USER/DEPLOY_PATH secrets. Override any of
# these on the command line to point at a different box, e.g.:
#
#   make new-vps DEPLOY_HOST=1.2.3.4 SSH_KEY=~/.ssh/new-vps.pem
#
# `new-vps` is the single command for "the old VPS is gone, stand up a new
# one and restore everything onto it". `restore` is the single command for
# "the app DB itself is corrupted but the box is fine, fix it".
#
# Two ways docker/.env gets onto a new box (see `vps-env` below):
#   - SRC_HOST set: scp it straight from another box that's still reachable
#     (fastest, most common case — e.g. moving providers).
#   - SRC_HOST unset: pulled from the DEPLOY_ENV_FILE_BASE64 GitHub secret
#     via the provision-full-env.yml workflow (the true disaster path — the
#     old box is genuinely gone). Keep that secret fresh with `snapshot-env`.

REPO        ?= kimutaiwycliff/fundi-pos
SSH_KEY     ?= clif.pem
DEPLOY_HOST ?= 52.209.226.85
DEPLOY_USER ?= ubuntu
DEPLOY_PATH ?= fundi
COMPOSE     := docker compose -f docker-compose.yml -f docker-compose.prod.yml

SSH := ssh -i $(SSH_KEY) -o ConnectTimeout=15 -o ServerAliveInterval=15 -o StrictHostKeyChecking=accept-new $(DEPLOY_USER)@$(DEPLOY_HOST)
SCP := scp -i $(SSH_KEY) -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# --- The two commands you actually came here for ----------------------------

.PHONY: new-vps
new-vps: vps-check vps-install-docker vps-clone vps-network point-vps vps-env vps-domains vps-up-db _restore-db-only vps-up-app vps-migrate vps-verify ## THE full one-shot: bootstrap a brand-new VPS end to end and restore the latest DB backup onto it
	@echo ""
	@echo "New VPS is up, migrated, and restored from the latest backup."
	@echo "Still manual (outside this repo): if this box shares a domain with"
	@echo "another Caddy-fronted app (like the old one did with pharmatrack),"
	@echo "update that Caddy's upstream to point at this box's IP. If this is"
	@echo "a standalone box (WITH_CADDY=1), just confirm DNS points here."
	@echo "Once things look right: make snapshot-env  (keeps the disaster-"
	@echo "recovery secret in sync with whatever's actually running now)."

.PHONY: restore
restore: ## ONE-SHOT complete restore on DEPLOY_HOST: stops the app, restores the LATEST backup, brings everything back up
	@echo "==> Stopping app services (pausing DB writes)..."
	-$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) stop fundi-payload-api fundi-web fundi-powersync"
	@echo "==> Restoring latest backup..."
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) exec -T backup sh /restore.sh --latest --yes"
	@echo "==> Bringing the stack back up..."
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) up -d"
	@echo "==> Restore complete."

.PHONY: restore-from
restore-from: ## Same as `restore` but from a SPECIFIC dump: make restore-from DUMP=s3://bucket/pos_saas-....sql.gz
	@test -n "$(DUMP)" || (echo "Usage: make restore-from DUMP=<s3://bucket/key or /backups/local-path.sql.gz>"; exit 1)
	@echo "==> Stopping app services (pausing DB writes)..."
	-$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) stop fundi-payload-api fundi-web fundi-powersync"
	@echo "==> Restoring $(DUMP)..."
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) exec -T backup sh /restore.sh '$(DUMP)' --yes"
	@echo "==> Bringing the stack back up..."
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) up -d"

.PHONY: _restore-db-only
_restore-db-only: # internal: used by new-vps, where app services aren't up yet so there's nothing to stop/restart
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) exec -T backup sh /restore.sh --latest --yes"

# --- Individual bootstrap steps (composed by `new-vps`, also usable alone) --

.PHONY: vps-check
vps-check: ## Confirm SSH access to DEPLOY_HOST works
	@echo "Checking SSH access to $(DEPLOY_USER)@$(DEPLOY_HOST) using $(SSH_KEY)..."
	$(SSH) "echo connected as \$$(whoami) on \$$(hostname)"

.PHONY: vps-install-docker
vps-install-docker: ## Install Docker + the Compose plugin on DEPLOY_HOST (safe to re-run)
	$(SSH) 'command -v docker >/dev/null 2>&1 && echo "Docker already installed." || (curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $(DEPLOY_USER) && echo "Installed Docker.")'

.PHONY: vps-clone
vps-clone: ## Clone (or fast-forward pull) this repo onto DEPLOY_HOST at DEPLOY_PATH
	$(SSH) 'test -d $(DEPLOY_PATH)/.git && (cd $(DEPLOY_PATH) && git pull --ff-only) || git clone https://github.com/$(REPO).git $(DEPLOY_PATH)'

.PHONY: vps-network
vps-network: ## Create the external Docker network the compose stack expects (pharmatrack_default), if it doesn't already exist
	$(SSH) 'docker network inspect pharmatrack_default >/dev/null 2>&1 || docker network create pharmatrack_default'

.PHONY: point-vps
point-vps: ## Repoint the GitHub Actions deploy secrets (DEPLOY_HOST/USER/PATH) at DEPLOY_HOST — affects every future deploy.yml/provision-*.yml run
	gh secret set DEPLOY_HOST --repo $(REPO) --body "$(DEPLOY_HOST)"
	gh secret set DEPLOY_USER --repo $(REPO) --body "$(DEPLOY_USER)"
	gh secret set DEPLOY_PATH --repo $(REPO) --body "$(DEPLOY_PATH)"
	@echo "DEPLOY_HOST/USER/PATH now point at $(DEPLOY_USER)@$(DEPLOY_HOST):$(DEPLOY_PATH)."
	@echo "If this box uses a DIFFERENT ssh key than before, also run:"
	@echo "  gh secret set DEPLOY_SSH_KEY --repo $(REPO) < $(SSH_KEY)"

.PHONY: vps-env
vps-env: ## Seed docker/.env on DEPLOY_HOST — scp's from SRC_HOST if given, else pulls the GitHub disaster-recovery snapshot
ifdef SRC_HOST
	@echo "==> Copying docker/.env from $(SRC_HOST) (still-reachable old box)..."
	$(SCP) $(DEPLOY_USER)@$(SRC_HOST):$(DEPLOY_PATH)/docker/.env /tmp/fundi-env-transfer
	$(SCP) /tmp/fundi-env-transfer $(DEPLOY_USER)@$(DEPLOY_HOST):$(DEPLOY_PATH)/docker/.env
	@rm -f /tmp/fundi-env-transfer
else
	@echo "==> No SRC_HOST given — pulling docker/.env from the GitHub snapshot"
	@echo "    secret instead (pass SRC_HOST=<old-ip> to scp directly from a"
	@echo "    still-reachable box instead — faster and doesn't need this)."
	gh workflow run provision-full-env.yml --repo $(REPO)
	@echo "Triggered — waiting for it to finish..."
	@sleep 8
	@run_id=$$(gh run list --workflow=provision-full-env.yml --repo $(REPO) --limit 1 --json databaseId -q '.[0].databaseId'); \
	 gh run watch $$run_id --repo $(REPO) --exit-status
endif

.PHONY: snapshot-env
snapshot-env: ## Capture DEPLOY_HOST's CURRENT docker/.env into the DEPLOY_ENV_FILE_BASE64 GitHub secret — re-run after ANY change to the server's .env
	@echo "==> Snapshotting docker/.env from $(DEPLOY_HOST) into the DEPLOY_ENV_FILE_BASE64 secret (value never printed)..."
	$(SSH) "base64 -w0 $(DEPLOY_PATH)/docker/.env" | gh secret set DEPLOY_ENV_FILE_BASE64 --repo $(REPO) --body -
	@echo "Snapshot updated."

.PHONY: vps-domains
vps-domains: # internal: no-op unless WITH_CADDY is set
ifdef WITH_CADDY
	@$(MAKE) --no-print-directory vps-set-domains
else
	@true
endif

.PHONY: vps-set-domains
vps-set-domains: ## Write API_DOMAIN/WEB_DOMAIN/POWERSYNC_DOMAIN into DEPLOY_HOST's docker/.env — only needed for a standalone box using its OWN Caddy (WITH_CADDY=1)
	@test -n "$(API_DOMAIN)" -a -n "$(WEB_DOMAIN)" -a -n "$(POWERSYNC_DOMAIN)" || (echo "Usage: make vps-set-domains API_DOMAIN=api.example.com WEB_DOMAIN=app.example.com POWERSYNC_DOMAIN=sync.example.com"; exit 1)
	$(SSH) "cd $(DEPLOY_PATH)/docker && (grep -v -E '^(API_DOMAIN|WEB_DOMAIN|POWERSYNC_DOMAIN)=' .env > .env.tmp || true) && printf 'API_DOMAIN=$(API_DOMAIN)\nWEB_DOMAIN=$(WEB_DOMAIN)\nPOWERSYNC_DOMAIN=$(POWERSYNC_DOMAIN)\n' >> .env.tmp && mv .env.tmp .env"

.PHONY: vps-up-db
vps-up-db: ## Start just postgres/postgres-storage/backup on DEPLOY_HOST — enough to have something to restore into
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) up -d postgres postgres-storage backup"

.PHONY: vps-up-app
vps-up-app: ## Build and start the rest of the stack on DEPLOY_HOST (api/web/powersync, + caddy if WITH_CADDY=1)
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) build fundi-payload-api fundi-web && $(COMPOSE) up -d fundi-payload-api fundi-web fundi-powersync $(if $(WITH_CADDY),caddy,)"

.PHONY: vps-up
vps-up: ## Build and start EVERYTHING on DEPLOY_HOST at once (standalone command, e.g. after a host reboot — not used by new-vps, which phases db-then-app)
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) build && $(COMPOSE) up -d"

.PHONY: vps-migrate
vps-migrate: ## Apply pending Payload migrations on DEPLOY_HOST (same script deploy.yml runs after every deploy)
	$(SSH) "cd $(DEPLOY_PATH) && bash docker/migrate.sh"

.PHONY: vps-verify
vps-verify: ## Health-check the deployed stack on DEPLOY_HOST
	@echo "--- Container status ---"
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) ps"
	@echo "--- API health (container-internal) ---"
	-$(SSH) "curl -s -o /dev/null -w 'admin -> %{http_code}\n' --max-time 15 http://localhost:3001/admin"

# --- Day-to-day helpers ------------------------------------------------------

.PHONY: deploy
deploy: ## Trigger a normal app deploy (build+restart fundi-payload-api/fundi-web) via the existing CI/CD workflow
	gh workflow run deploy.yml --repo $(REPO)

.PHONY: backup-now
backup-now: ## Run a Postgres backup immediately on DEPLOY_HOST instead of waiting for the daily loop
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) exec -T backup sh /backup.sh"

.PHONY: ssh
ssh: ## Open an interactive shell on DEPLOY_HOST
	ssh -i $(SSH_KEY) -o ConnectTimeout=15 $(DEPLOY_USER)@$(DEPLOY_HOST)

.PHONY: logs
logs: ## Tail logs for one service on DEPLOY_HOST: make logs SERVICE=fundi-payload-api
	@test -n "$(SERVICE)" || (echo "Usage: make logs SERVICE=<service-name>"; exit 1)
	$(SSH) "cd $(DEPLOY_PATH)/docker && $(COMPOSE) logs -f --tail=200 $(SERVICE)"

.PHONY: status
status: ## Show container status on DEPLOY_HOST (fundi's own containers + anything else on the box, e.g. pharmatrack)
	$(SSH) "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
