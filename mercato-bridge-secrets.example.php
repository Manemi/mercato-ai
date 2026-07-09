<?php
// Copy to mercato-bridge-secrets.php on the server and keep it out of version control.
return [
    'BRIDGE_SECRET' => 'replace_with_long_random_secret',

    // Optional if OpenCart config.php is available next to mercato-bridge.php.
    // If config.php is not available, fill these values from hosting panel.
    'DB_HOST' => '',
    'DB_USER' => '',
    'DB_PASS' => '',
    'DB_NAME' => '',
    'PREFIX' => 'oc_',
    'LANG_ID' => 2,
];
