# Testing

## Test Types

| Type | Base Class | What runs | Use when |
|---|---|---|---|
| Unit | `UnitTestCase` | No Drupal bootstrap, no DB | Testing pure PHP logic (classes, algorithms) |
| Kernel | `KernelTestBase` | Minimal Drupal, schema installable | Testing services, entities, hooks, DB interactions |
| Functional | `BrowserTestBase` | Full Drupal install, browser emulation | Testing UI, routes, forms, access, full page rendering |
| FunctionalJavascript | `WebDriverTestBase` | Full install + Chrome/Selenium | Testing JavaScript, AJAX, dynamic UI |

**Drupal 11 requires PHPUnit 11** (Drupal 11.2+). Earlier Drupal 11.0/11.1 used PHPUnit 10.5.
**Simpletest is removed.** Do not use it. All tests must use PHPUnit.

### PHPUnit 11 Key Changes
- `setUp()` and `tearDown()` must declare `void` return type.
- `@covers`, `@dataProvider` etc. are now native PHP attributes: `#[CoversClass(...)]`, `#[DataProvider(...)]`.
- `$this->getMockBuilder(...)->getMock()` still works; `createMock()` is preferred.

## Test File Locations and Namespaces

```
tests/src/Unit/MyTest.php           → namespace Drupal\Tests\my_module\Unit
tests/src/Kernel/MyKernelTest.php   → namespace Drupal\Tests\my_module\Kernel
tests/src/Functional/MyFuncTest.php → namespace Drupal\Tests\my_module\Functional
tests/src/FunctionalJavascript/MyJsTest.php → namespace Drupal\Tests\my_module\FunctionalJavascript
tests/modules/                      → helper test-only modules
```

## Unit Test

```php
namespace Drupal\Tests\my_module\Unit;

use Drupal\Tests\UnitTestCase;
use Drupal\my_module\Calculator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;

/**
 * Tests the Calculator class.
 */
#[CoversClass(Calculator::class)]
#[Group('my_module')]
class CalculatorTest extends UnitTestCase {

  protected Calculator $calculator;

  // PHPUnit 11: void return type required
  protected function setUp(): void {
    parent::setUp();
    $this->calculator = new Calculator(10, 5);
  }

  public function testAdd(): void {
    $this->assertEquals(15, $this->calculator->add());
  }

  public function testSubtract(): void {
    $this->assertEquals(5, $this->calculator->subtract());
  }
}
```

**Rules:**
- Use `#[Group('my_module')]` PHP attribute (PHPUnit 11) or `@group my_module` docblock annotation — both work, PHP attributes are preferred in new tests.
- `#[CoversClass(MyClass::class)]` replaces `@covers` annotations.
- `setUp(): void` — the `void` return type is now required by PHPUnit 11.
- Call `parent::setUp()` first in every `setUp()` method.

## Mocking

```php
// Mock a service
$config_factory = $this->createMock(ConfigFactoryInterface::class);
$config_factory->method('get')
  ->with('my_module.settings')
  ->willReturn($this->createMock(ImmutableConfig::class));

// Mock a Drupal entity
$user = $this->getMockBuilder(UserInterface::class)
  ->disableOriginalConstructor()
  ->getMock();
$user->method('getDisplayName')->willReturn('Test User');
$user->method('hasPermission')
  ->with('administer content')
  ->willReturn(TRUE);

// Use the mock
$service = new MyService($config_factory);
```

## Kernel Test

```php
namespace Drupal\Tests\my_module\Kernel;

use Drupal\KernelTests\KernelTestBase;

/**
 * Tests the queue worker processes items correctly.
 *
 * @group my_module
 */
class TeamCleanerTest extends KernelTestBase {

  protected static $modules = ['my_module', 'system', 'user'];

  protected function setUp(): void {
    parent::setUp();
    $this->installSchema('my_module', ['my_module_teams']); // non-entity table
    $this->installEntitySchema('node');                      // entity table
    $this->installConfig(['my_module']);                     // module config
  }

  public function testQueueProcessing(): void {
    $database = $this->container->get('database');
    $database->insert('my_module_teams')->fields(['name' => 'Team A'])->execute();

    $worker = $this->container
      ->get('plugin.manager.queue_worker')
      ->createInstance('my_module_cleaner');

    $item = (object)['id' => 1];
    $worker->processItem($item);

    $count = $database->select('my_module_teams', 't')
      ->countQuery()
      ->execute()
      ->fetchField();
    $this->assertEquals(0, $count);
  }
}
```

**Available setup methods:**
- `installSchema('module', ['table'])` — install a non-entity DB table
- `installEntitySchema('entity_type')` — install entity storage tables
- `installConfig(['module'])` — import default config from `config/install/`
- `installModules(['module'])` — install additional modules

## Functional Test

```php
namespace Drupal\Tests\my_module\Functional;

use Drupal\Tests\BrowserTestBase;

/**
 * Tests the My Module admin pages.
 *
 * @group my_module
 */
class AdminPageTest extends BrowserTestBase {

  protected static $modules = ['my_module'];

  protected $defaultTheme = 'stark';  // required in Drupal 9+

  public function testSettingsPage(): void {
    // Test anonymous access is denied
    $this->drupalGet('/admin/config/system/my-module');
    $this->assertSession()->statusCodeEquals(403);

    // Create a user with the required permission
    $admin = $this->drupalCreateUser(['administer my module']);
    $this->drupalLogin($admin);

    // Test the settings page is accessible
    $this->drupalGet('/admin/config/system/my-module');
    $this->assertSession()->statusCodeEquals(200);
    $this->assertSession()->pageTextContains('My Module Settings');

    // Submit the form
    $this->submitForm(['salutation' => 'Good morning'], 'Save configuration');
    $this->assertSession()->pageTextContains('The configuration options have been saved.');

    // Verify the config was saved
    $config = $this->config('my_module.settings');
    $this->assertEquals('Good morning', $config->get('salutation'));
  }

  public function testContentPage(): void {
    $this->drupalGet('/my-page');
    $this->assertSession()->statusCodeEquals(200);
    $this->assertSession()->elementExists('css', '.my-module-content');
    $this->assertSession()->elementTextContains('css', 'h1', 'My Page');
  }
}
```

### Common Assertions

```php
$this->assertSession()->statusCodeEquals(200);
$this->assertSession()->statusCodeEquals(403);
$this->assertSession()->statusCodeEquals(404);
$this->assertSession()->pageTextContains('expected text');
$this->assertSession()->pageTextNotContains('absent text');
$this->assertSession()->elementExists('css', '.my-class');
$this->assertSession()->elementTextContains('css', 'h1', 'Title');
$this->assertSession()->fieldExists('edit-salutation');
$this->assertSession()->fieldValueEquals('edit-salutation', 'Good morning');
$this->assertSession()->addressEquals('/admin/config');
$this->assertSession()->linkExists('Click here');
$this->assertSession()->responseContains('<strong>bold</strong>');
```

### Helpers

```php
$admin = $this->drupalCreateUser(['permission one', 'permission two']);
$this->drupalLogin($admin);
$this->drupalLogout();

$node = $this->drupalCreateNode(['type' => 'article', 'title' => 'Test']);

// Follow a link
$this->clickLink('Edit');
$this->drupalGet('/node/1/edit');

// Submit a form
$this->submitForm(['edit-title-0-value' => 'New Title'], 'Save');
```

## FunctionalJavascript Test

```php
namespace Drupal\Tests\my_module\FunctionalJavascript;

use Drupal\FunctionalJavascriptTests\WebDriverTestBase;

/**
 * Tests AJAX form behavior.
 *
 * @group my_module
 */
class AjaxFormTest extends WebDriverTestBase {

  protected static $modules = ['my_module'];
  protected $defaultTheme = 'stark';

  public function testAjaxFieldUpdate(): void {
    $admin = $this->drupalCreateUser(['administer my module']);
    $this->drupalLogin($admin);
    $this->drupalGet('/my-module/add');

    $page = $this->getSession()->getPage();

    // Select a value to trigger AJAX
    $page->selectFieldOption('edit-type', 'advanced');

    // Wait for AJAX response
    $this->assertSession()->assertWaitOnAjaxRequest();

    // Assert dynamic content appeared
    $this->assertSession()->elementExists('css', '#advanced-options');
    $this->assertSession()->fieldExists('edit-advanced-setting');

    // Test machine name auto-generation
    $page->fillField('edit-label', 'My Test Item');
    $this->assertJsCondition('jQuery(".machine-name-value").html() == "my_test_item"');

    // Screenshot for debugging
    // $this->createScreenshot('/tmp/test-screenshot.png');
  }
}
```

**FunctionalJavascript-specific methods:**
- `$this->assertSession()->assertWaitOnAjaxRequest()` — wait for pending AJAX
- `$this->assertJsCondition('js expression')` — wait until JS expression is truthy
- `$page->attachFileToField('edit-file', '/absolute/path/to/file.csv')` — file upload
- `$this->createScreenshot('/tmp/screenshot.png')` — capture screenshot for debugging

## Running Tests

```bash
# From Drupal root directory
cd /path/to/drupal

# Run all tests for a module
vendor/bin/phpunit modules/custom/my_module/tests

# Run a specific test class
vendor/bin/phpunit modules/custom/my_module/tests/src/Unit/CalculatorTest.php

# Run by group
vendor/bin/phpunit --group=my_module

# Run by filter (method name)
vendor/bin/phpunit --filter=testAdd

# Run with verbose output
vendor/bin/phpunit --verbose modules/custom/my_module/tests
```

### Required Environment Variables

```bash
# For Kernel and Functional tests
export SIMPLETEST_DB='mysql://user:password@localhost/dbname'
export SIMPLETEST_BASE_URL='http://localhost'
export BROWSERTEST_OUTPUT_DIRECTORY='/tmp/browser-tests'

# For FunctionalJavascript (with ChromeDriver)
export MINK_DRIVER_ARGS_WEBDRIVER='["chrome", {"browserName": "chrome", "goog:chromeOptions": {"args": ["--headless"]}}, "http://localhost:4444"]'
```

### phpunit.xml Setup

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="core/tests/bootstrap.php">
  <php>
    <env name="SIMPLETEST_DB" value="mysql://drupal:drupal@127.0.0.1/drupal"/>
    <env name="SIMPLETEST_BASE_URL" value="http://localhost"/>
    <env name="BROWSERTEST_OUTPUT_DIRECTORY" value="/tmp/phpunit-browser-output"/>
  </php>
  <testsuites>
    <testsuite name="unit">
      <directory>modules/custom/*/tests/src/Unit</directory>
    </testsuite>
    <testsuite name="kernel">
      <directory>modules/custom/*/tests/src/Kernel</directory>
    </testsuite>
    <testsuite name="functional">
      <directory>modules/custom/*/tests/src/Functional</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

## Test Helper Modules

For tests that need specific content types, fields, or configuration, create a minimal helper module in `tests/modules/`:

```
tests/modules/my_module_test/
├── my_module_test.info.yml
├── config/install/    # Test-specific configuration
└── src/               # Test-specific classes
```

Reference in test:

```php
protected static $modules = ['my_module', 'my_module_test'];
```
