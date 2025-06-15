# GitHub Actions Deployment Setup

## 1. Generate SSH Key Pair
On your local machine, generate a new SSH key specifically for deployment:
```bash
ssh-keygen -t ed25519 -C "github-actions-deployment" -f ~/.ssh/github_actions_deploy
```

## 2. Add Public Key to webhost Server
Copy the public key to your webhost server:
```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub your-user@your-linode-ip
```

Or manually add it to `~/.ssh/authorized_keys` on your webhost server.

## 3. Configure GitHub Secrets
Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

### LINODE_HOST
- Your webhost server's IP address or domain name
- Example: `123.45.67.89` or `example.com`

### LINODE_USER
- The SSH username on your webhost server
- Example: `deploy` or `root` (though root is not recommended)

### LINODE_SSH_KEY
- Copy the entire contents of your private key:
```bash
cat ~/.ssh/github_actions_deploy
```
- Paste the complete output including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`

### LINODE_DEPLOY_PATH
- The directory path on your webhost server where files should be deployed
- Example: `/var/www/html` or `/home/deploy/sites/currency-converter`

## 4. Update Workflow File
Edit `.github/workflows/deploy.yml` line 79 to replace `your-domain.com` with your actual domain.

## 5. Test the Deployment
Create and push a version tag:
```bash
git tag 1.0.0
git push origin 1.0.0
```

## 6. Monitor the Deployment
- Go to your repository → Actions tab
- Watch the workflow run
- Check for any errors in the logs

## Troubleshooting

### Permission Denied
- Ensure the SSH key has correct permissions (600)
- Verify the public key is in authorized_keys on webhost

### Host Key Verification Failed
- The workflow automatically adds the host to known_hosts
- If issues persist, you may need to manually verify the host key

### Path Issues
- Ensure LINODE_DEPLOY_PATH exists on the server
- The deploy user must have write permissions to this directory

### File Permissions
- The workflow sets 644 for files and 755 for directories
- Adjust if your server requires different permissions
