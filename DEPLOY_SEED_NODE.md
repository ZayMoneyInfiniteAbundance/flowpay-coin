# Deploying the FPC Seed Node

You need one "always-on" node so new users can join the network.

## Option A: Railway (Easiest & Free Tier)

1.  **Sign up** at [railway.app](https://railway.app) (GitHub login recommended).
2.  Click **"New Project"** → **"Deploy from GitHub repo"**.
3.  Select your repo: `flowpay-coin`.
4.  Railway will automatically detect the `railway.toml` and `Dockerfile`.
5.  Click **"Deploy Now"**.

Once deployed, Railway will give you a domain (e.g., `flowpay-coin-production.up.railway.app`).

### Update the Code
1.  Copy that domain.
2.  Open `genesis.js` in your local code.
3.  Add it to `SEED_NODES`:
    ```javascript
    const SEED_NODES = [
        'wss://flowpay-coin-production.up.railway.app' 
    ];
    ```
4.  Commit and push:
    ```bash
    git add genesis.js
    git commit -m "Add production seed node"
    git push
    ```

Now everyone who clones your repo will automatically connect to your seed node!

## Option B: Run locally
If you have a server with a public IP, just run:
```bash
node network/node.js --port 6001
```
And share your IP: `ws://YOUR_IP:6001`.
