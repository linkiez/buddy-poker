# TURN Server SSL Certificates

This directory should contain SSL/TLS certificates for the TURN server.

## For Development (Self-Signed Certificates)

Generate self-signed certificates for testing:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=turn.buddy-poker.example.com"
```

Then copy them to this directory:
```bash
cp cert.pem coturn/certs/
cp key.pem coturn/certs/
```

## For Production (Let's Encrypt)

Use Let's Encrypt to obtain free SSL certificates:

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate (replace with your domain)
sudo certbot certonly --standalone -d turn.yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem coturn/certs/cert.pem
sudo cp /etc/letsencrypt/live/turn.yourdomain.com/privkey.pem coturn/certs/key.pem
```

## Important Notes

- **Never commit actual certificates to version control**
- The `.gitignore` should exclude `*.pem` files
- Certificates must match the domain name configured in `turnserver.conf`
- TURN over TLS (turns:) on port 443 requires valid certificates
- Renew certificates before expiration (Let's Encrypt: every 90 days)

## Files Required

- `cert.pem` - SSL certificate (public)
- `key.pem` - Private key (keep secure!)

## Verify Configuration

After starting coturn, test the TURN server:

```bash
# Using turnutils-stunclient (from coturn package)
turnutils-stunclient -v turn.yourdomain.com

# Using turnutils-uclient for TURN testing
turnutils-uclient -v -u buddypoker -w change-me-in-production turn.yourdomain.com
```
