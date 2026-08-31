import * as migration_20260825_085003_initial_baseline from './20260825_085003_initial_baseline';
import * as migration_20260831_080939_add_customer_email from './20260831_080939_add_customer_email';
import * as migration_20260831_125702_add_product_archive_and_related from './20260831_125702_add_product_archive_and_related';

export const migrations = [
  {
    up: migration_20260825_085003_initial_baseline.up,
    down: migration_20260825_085003_initial_baseline.down,
    name: '20260825_085003_initial_baseline',
  },
  {
    up: migration_20260831_080939_add_customer_email.up,
    down: migration_20260831_080939_add_customer_email.down,
    name: '20260831_080939_add_customer_email',
  },
  {
    up: migration_20260831_125702_add_product_archive_and_related.up,
    down: migration_20260831_125702_add_product_archive_and_related.down,
    name: '20260831_125702_add_product_archive_and_related'
  },
];
