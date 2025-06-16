<?php
// This version uses PHPMailer for Google SMTP
// Run: composer require phpmailer/phpmailer

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// Load environment variables from .env file if it exists
if (file_exists(__DIR__ . '/.env')) {
    $lines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!isset($_ENV[$name])) {
            $_ENV[$name] = $value;
        }
    }
}

// Load configuration
$config = require_once 'config.php';

// Load Composer's autoloader
require 'vendor/autoload.php';

// Enable error reporting for debugging (disable in production)
ini_set('display_errors', 0);
error_reporting(E_ALL);

// CORS headers if needed
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get POST data
$name = filter_var($_POST['name'] ?? '', FILTER_SANITIZE_STRING);
$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
$message = filter_var($_POST['message'] ?? '', FILTER_SANITIZE_STRING);

// Validate inputs
if (!$name || !$email || !$message) {
    http_response_code(400);
    echo json_encode(['error' => 'All fields are required']);
    exit;
}

// Optional: Verify reCAPTCHA if enabled
if ($config['recaptcha']['enabled']) {
    $recaptcha_response = $_POST['g-recaptcha-response'] ?? '';
    if (!$recaptcha_response) {
        http_response_code(400);
        echo json_encode(['error' => 'Please complete the reCAPTCHA']);
        exit;
    }
    
    $verify_url = 'https://www.google.com/recaptcha/api/siteverify';
    $verify_data = [
        'secret' => $config['recaptcha']['secret_key'],
        'response' => $recaptcha_response,
        'remoteip' => $_SERVER['REMOTE_ADDR']
    ];
    
    $verify_options = [
        'http' => [
            'method' => 'POST',
            'content' => http_build_query($verify_data)
        ]
    ];
    
    $verify_context = stream_context_create($verify_options);
    $verify_result = file_get_contents($verify_url, false, $verify_context);
    $verify_json = json_decode($verify_result, true);
    
    if (!$verify_json['success']) {
        http_response_code(400);
        echo json_encode(['error' => 'reCAPTCHA verification failed']);
        exit;
    }
}

// Create a new PHPMailer instance
$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host       = $config['email']['smtp']['host'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $config['email']['smtp']['username'];
    $mail->Password   = $config['email']['smtp']['password'];
    $mail->SMTPSecure = $config['email']['smtp']['encryption'];
    $mail->Port       = $config['email']['smtp']['port'];

    // Recipients
    $mail->setFrom($config['email']['smtp']['username'], $config['email']['smtp']['from_name']);
    $mail->addAddress($config['email']['to']);
    $mail->addReplyTo($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = 'Currency Converter Contact: ' . $name;
    
    // Email body
    $mail->Body = "
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #333; }
            .value { color: #555; }
            .footer { text-align: center; padding: 10px; color: #6c757d; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <h2>New Contact Form Submission</h2>
            </div>
            <div class='content'>
                <div class='field'>
                    <span class='label'>Name:</span>
                    <span class='value'>" . htmlspecialchars($name) . "</span>
                </div>
                <div class='field'>
                    <span class='label'>Email:</span>
                    <span class='value'>" . htmlspecialchars($email) . "</span>
                </div>
                <div class='field'>
                    <span class='label'>Message:</span>
                    <div class='value'>" . nl2br(htmlspecialchars($message)) . "</div>
                </div>
            </div>
            <div class='footer'>
                <p>Sent from Currency Converter contact form</p>
                <p>IP: " . $_SERVER['REMOTE_ADDR'] . " | Time: " . date('Y-m-d H:i:s') . "</p>
            </div>
        </div>
    </body>
    </html>
    ";
    
    // Plain text alternative
    $mail->AltBody = "New Contact Form Submission\n\n" .
                     "Name: $name\n" .
                     "Email: $email\n" .
                     "Message:\n$message\n\n" .
                     "Sent from Currency Converter contact form";

    // Send the email
    $mail->send();
    
    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Thank you for your message! We\'ll get back to you soon.'
    ]);
    
} catch (Exception $e) {
    // Error response
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to send message. Please try again later.',
        'debug' => $mail->ErrorInfo // Remove this in production
    ]);
}
?>