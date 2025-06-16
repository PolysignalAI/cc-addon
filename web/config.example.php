<?php
// Example configuration file
// Copy this to config.php and update with your values
// NEVER commit config.php to version control

return [
    'email' => [
        // Recipient email address
        'to' => $_ENV['CONTACT_EMAIL_TO'] ?? 'your-email@example.com',
        
        // Google SMTP settings
        'smtp' => [
            'host' => 'smtp.gmail.com',
            'port' => 587,
            'username' => $_ENV['GMAIL_USERNAME'] ?? 'your-gmail@gmail.com',
            'password' => $_ENV['GMAIL_APP_PASSWORD'] ?? 'your-app-password',
            'encryption' => 'tls',
            'from_name' => 'Currency Converter Contact Form',
        ]
    ],
    
    // reCAPTCHA settings
    'recaptcha' => [
        'enabled' => true,
        'site_key' => $_ENV['RECAPTCHA_SITE_KEY'] ?? 'YOUR-RECAPTCHA-SITE-KEY',
        'secret_key' => $_ENV['RECAPTCHA_SECRET_KEY'] ?? 'YOUR-RECAPTCHA-SECRET-KEY',
    ]
];
?>