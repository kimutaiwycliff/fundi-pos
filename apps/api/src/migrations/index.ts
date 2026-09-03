import * as migration_20260825_085003_initial_baseline from './20260825_085003_initial_baseline';
import * as migration_20260831_080939_add_customer_email from './20260831_080939_add_customer_email';
import * as migration_20260831_125702_add_product_archive_and_related from './20260831_125702_add_product_archive_and_related';
import * as migration_20260901_051440_add_credit_payments from './20260901_051440_add_credit_payments';
import * as migration_20260901_052220_rename_max_discount_to_amount from './20260901_052220_rename_max_discount_to_amount';
import * as migration_20260901_072707_add_variant_prices from './20260901_072707_add_variant_prices';
import * as migration_20260901_081105_default_tax_and_optional_codes from './20260901_081105_default_tax_and_optional_codes';
import * as migration_20260901_084514_add_media_and_product_images from './20260901_084514_add_media_and_product_images';
import * as migration_20260903_064520_add_line_item_variant_tenant_store from './20260903_064520_add_line_item_variant_tenant_store';
import * as migration_20260903_073000_backfill_line_item_variant_tenant_store from './20260903_073000_backfill_line_item_variant_tenant_store';
import * as migration_20260903_090000_fix_tenant_store_column_types from './20260903_090000_fix_tenant_store_column_types';
import * as migration_20260903_114432_add_tenant_status_and_platform_audit_log from './20260903_114432_add_tenant_status_and_platform_audit_log';

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
    name: '20260831_125702_add_product_archive_and_related',
  },
  {
    up: migration_20260901_051440_add_credit_payments.up,
    down: migration_20260901_051440_add_credit_payments.down,
    name: '20260901_051440_add_credit_payments',
  },
  {
    up: migration_20260901_052220_rename_max_discount_to_amount.up,
    down: migration_20260901_052220_rename_max_discount_to_amount.down,
    name: '20260901_052220_rename_max_discount_to_amount',
  },
  {
    up: migration_20260901_072707_add_variant_prices.up,
    down: migration_20260901_072707_add_variant_prices.down,
    name: '20260901_072707_add_variant_prices',
  },
  {
    up: migration_20260901_081105_default_tax_and_optional_codes.up,
    down: migration_20260901_081105_default_tax_and_optional_codes.down,
    name: '20260901_081105_default_tax_and_optional_codes',
  },
  {
    up: migration_20260901_084514_add_media_and_product_images.up,
    down: migration_20260901_084514_add_media_and_product_images.down,
    name: '20260901_084514_add_media_and_product_images',
  },
  {
    up: migration_20260903_064520_add_line_item_variant_tenant_store.up,
    down: migration_20260903_064520_add_line_item_variant_tenant_store.down,
    name: '20260903_064520_add_line_item_variant_tenant_store',
  },
  {
    up: migration_20260903_073000_backfill_line_item_variant_tenant_store.up,
    down: migration_20260903_073000_backfill_line_item_variant_tenant_store.down,
    name: '20260903_073000_backfill_line_item_variant_tenant_store',
  },
  {
    up: migration_20260903_090000_fix_tenant_store_column_types.up,
    down: migration_20260903_090000_fix_tenant_store_column_types.down,
    name: '20260903_090000_fix_tenant_store_column_types',
  },
  {
    up: migration_20260903_114432_add_tenant_status_and_platform_audit_log.up,
    down: migration_20260903_114432_add_tenant_status_and_platform_audit_log.down,
    name: '20260903_114432_add_tenant_status_and_platform_audit_log'
  },
];
