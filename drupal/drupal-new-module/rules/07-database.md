# Database API

## Core Principle

**Never write raw SQL with concatenated user input.** Always use the Drupal Database API — it handles parameterization, table prefixing, and cross-database compatibility.

## Table Naming

- Wrap table names in `{}` braces: `{node}`, `{users_field_data}`, `{my_module_items}`
- Wrap column names in `[]` brackets for cross-database compatibility: `[nid]`, `[status]`, `[created]`

## Query Types

### Select

```php
// Simple
$result = $database->select('my_module_players', 'p')
  ->fields('p')                               // all columns
  ->condition('p.status', 1)
  ->orderBy('p.name')
  ->execute()
  ->fetchAll();

// Specific fields
$query = $database->select('my_module_players', 'p');
$query->addField('p', 'name');
$query->addField('p', 'id');
$query->condition('p.active', 1);
$records = $query->execute()->fetchAllAssoc('id');

// With JOIN
$query = $database->select('my_module_players', 'p');
$query->join('my_module_teams', 't', 't.id = p.team_id');
$query->addField('p', 'name', 'player_name');
$query->addField('t', 'name', 'team_name');
$result = $query->execute()->fetchAll();

// Counting
$count = $database->select('my_module_players', 'p')
  ->countQuery()
  ->execute()
  ->fetchField();
```

### Insert

```php
$database->insert('my_module_players')
  ->fields([
    'name'    => $name,
    'team_id' => $team_id,
    'created' => time(),
  ])
  ->execute();

// Multi-row insert
$query = $database->insert('my_module_items')->fields(['name', 'value']);
foreach ($items as $item) {
  $query->values([$item['name'], $item['value']]);
}
$query->execute();
```

### Update

```php
$database->update('my_module_players')
  ->fields(['status' => 0, 'updated' => time()])
  ->condition('id', $id)
  ->execute();
```

### Delete

```php
$database->delete('my_module_players')
  ->condition('id', $ids, 'IN')
  ->execute();
```

### Upsert (Insert or Update)

```php
$database->upsert('my_module_settings')
  ->key('name')
  ->fields(['name', 'value'])
  ->values(['my_key', $value])
  ->execute();
```

### Direct Query (use only when query builder is insufficient)

```php
// Always use placeholders — NEVER concatenate variables
$result = $database->query(
  "SELECT [id], [name] FROM {teams} WHERE [status] = :status AND [created] > :since",
  [':status' => 1, ':since' => $timestamp]
)->fetchAllAssoc('id');
```

## Transactions

```php
$transaction = $database->startTransaction();
try {
  $database->insert('my_module_teams')->fields(['name' => 'Team A'])->execute();
  $database->update('my_module_players')->fields(['team_id' => $id])->execute();
  // Transaction commits when $transaction goes out of scope
}
catch (\Exception $e) {
  $transaction->rollBack();
  watchdog_exception('my_module', $e);
  throw $e;
}
```

## Pager Query

```php
$query = $database->select('my_module_players', 'p')
  ->fields('p')
  ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
  ->limit(25);  // 25 items per page

$results = $query->execute()->fetchAll();
// Render pager in the return array:
$build['pager'] = ['#type' => 'pager'];
```

## Query Tags and Access Control

```php
// Tag a query so hook_query_TAG_alter() can modify it
$query->addTag('node_access');   // built-in: enforces node access
$query->addTag('my_custom_tag'); // custom tag for your own alter hook

// In any module's .module file:
function other_module_query_my_custom_tag_alter(AlterableInterface $query): void {
  $query->condition('p.status', 1);
}
```

Always add the `node_access` tag to queries that return node data visible to users.

## Schema Definition (`hook_schema()` in `.install`)

```php
function my_module_schema(): array {
  $schema['my_module_teams'] = [
    'description' => 'Stores team data.',
    'fields' => [
      'id' => [
        'type'     => 'serial',
        'unsigned' => TRUE,
        'not null' => TRUE,
      ],
      'name' => [
        'type'     => 'varchar',
        'length'   => 255,
        'not null' => TRUE,
        'default'  => '',
      ],
      'data' => [
        'type'      => 'blob',
        'not null'  => FALSE,
        'size'      => 'big',
        'serialize' => TRUE,
      ],
      'created' => [
        'type'     => 'int',
        'unsigned' => TRUE,
        'not null' => TRUE,
        'default'  => 0,
      ],
    ],
    'primary key' => ['id'],
    'indexes' => [
      'name' => ['name'],
    ],
  ];
  return $schema;
}
```

## Update Hooks (Schema Changes)

In `my_module.install`:

```php
/**
 * Add location column to teams table.
 */
function my_module_update_10001(array &$sandbox): void {
  $schema = \Drupal::database()->schema();
  $spec = ['type' => 'varchar', 'length' => 255, 'not null' => FALSE];
  $schema->addField('my_module_teams', 'location', $spec);
}
```

**Naming:** `modulename_update_XXYYZZ` where XX = Drupal major (10), YY = module major, ZZ = increments. Always increment — never reuse.

## Post-Update Hooks (Data Updates with Sandbox)

In `my_module.post_update.php`:

```php
/**
 * Migrate player status values to new format.
 */
function my_module_post_update_migrate_player_status(array &$sandbox): string {
  $database = \Drupal::database();

  // Initialize on first call
  if (empty($sandbox)) {
    $result = $database->query("SELECT [id] FROM {my_module_players}")->fetchAllAssoc('id');
    $sandbox['ids'] = array_keys($result);
    $sandbox['max'] = count($sandbox['ids']);
    $sandbox['progress'] = 0;
  }

  // Process a batch of 50
  $batch = array_splice($sandbox['ids'], 0, 50);
  foreach ($batch as $id) {
    $database->update('my_module_players')
      ->fields(['new_status' => 'active'])
      ->condition('id', $id)
      ->execute();
    $sandbox['progress']++;
  }

  $sandbox['#finished'] = $sandbox['max'] > 0
    ? $sandbox['progress'] / $sandbox['max']
    : 1;

  return t('@progress of @max processed.', [
    '@progress' => $sandbox['progress'],
    '@max'      => $sandbox['max'],
  ]);
}
```

**Rules:**
- Use `hook_update_N()` for schema/structural changes (adding columns, tables, indexes).
- Use `hook_post_update_NAME()` for data migrations — it supports multi-request processing via `$sandbox` and `$sandbox['#finished']`.
- Never modify data in `hook_update_N()` — use post_update hooks instead.
- Post-update hooks run after all `hook_update_N()` hooks.

## Injecting the Database Connection

```yaml
services:
  my_module.my_service:
    class: Drupal\my_module\MyService
    arguments: ['@database']
```

```php
class MyService {
  public function __construct(
    protected readonly Connection $database,
  ) {}
}
```
