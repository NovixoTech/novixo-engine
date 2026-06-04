# How to Publish Novixo Engine to npm

Follow these steps exactly. Do them in order.

---

## Step 1 — Create an npm account

Go to: https://www.npmjs.com/signup

Create your account. Remember your username and password.

---

## Step 2 — Login to npm in your terminal

```bash
npm login
```

It will ask for:
- Username
- Password
- Email
- OTP (one-time code sent to your email)

---

## Step 3 — Check the package name is available

```bash
npm search novixo-engine
```

If nothing comes back — the name is free. Good.

---

## Step 4 — Make sure your package.json is correct

Open `package.json` and update these fields:

```json
{
  "name": "novixo-engine",
  "version": "1.0.0",
  "author": {
    "name": "YOUR NAME",
    "url": "https://github.com/YOUR_USERNAME"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/novixo-engine.git"
  },
  "homepage": "https://github.com/YOUR_USERNAME/novixo-engine#readme"
}
```

Replace `YOUR_USERNAME` and `YOUR NAME` with your real details.

---

## Step 5 — Do a dry run first (IMPORTANT)

This simulates publishing without actually doing it.
It shows you exactly what files will be uploaded.

```bash
npm publish --dry-run
```

Check the output. You should see only:
```
index.js
index.cjs
src/
README.md
CHANGELOG.md
LICENSE
package.json
```

If you see `demo/` or `test/` in the list — something is wrong with `.npmignore`.

---

## Step 6 — Publish

```bash
npm publish --access public
```

`--access public` is required for free npm accounts publishing scoped packages.
For an unscoped package name like `novixo-engine`, you can also just run:

```bash
npm publish
```

---

## Step 7 — Verify it worked

Go to:
```
https://www.npmjs.com/package/novixo-engine
```

Your package page should be live within 1–2 minutes.

---

## Step 8 — Test the published package

In a new folder (outside your repo):

```bash
mkdir novixo-test
cd novixo-test
npm init -y
npm install novixo-engine
```

Then create `test.js`:

```js
import Novixo, { Priority, NetworkState } from "novixo-engine";

console.log("Novixo Engine installed ✓");
console.log("Priority:", Priority);
console.log("NetworkState:", NetworkState);
```

Run it:
```bash
node test.js
```

If it prints without errors — you're live. 🎉

---

## How to publish an update

When you make changes:

1. Update the version in `package.json`:
   - Bug fix:    `1.0.0` → `1.0.1`
   - New feature: `1.0.0` → `1.1.0`
   - Breaking change: `1.0.0` → `2.0.0`

2. Update `CHANGELOG.md` with what changed

3. Commit to GitHub:
   ```bash
   git add .
   git commit -m "release: v1.0.1"
   git push
   ```

4. Publish:
   ```bash
   npm publish
   ```

---

## CDN (for browser use without npm)

Once published, your package is automatically available via unpkg CDN:

```html
<script type="module">
  import Novixo from "https://unpkg.com/novixo-engine@1.0.0/index.js";

  await Novixo.init({ ... });
</script>
```

Share this URL with developers who want to use it without installing anything.
