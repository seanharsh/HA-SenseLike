# HACS Setup for SenseLike

✅ **Your project is now ready for HACS submission!**

## ✅ Files Created

1. **hacs.json** — HACS manifest file with project metadata
2. **LICENSE** — MIT License (industry standard for open-source projects)
3. **CHANGELOG.md** — Version history and release notes
4. **.gitignore** — Excludes unnecessary files from git

## ✅ Files Verified

- ✅ All 6 card files properly define and register custom elements
- ✅ Each card includes `window.customCards` registration for HA card picker
- ✅ README.md is comprehensive with configuration documentation
- ✅ example-dashboard.yaml provides working reference implementation
- ✅ No external CDN dependencies — all code is self-contained

## 📝 Before Publishing

### 1. hacs.json already configured
✅ [hacs.json](hacs.json) is already set up with your correct repository:
```json
"documentation": "https://github.com/seanharsh/HA-SenseLike",
"issues": "https://github.com/seanharsh/HA-SenseLike/issues",
```

### 2. Initialize Git Repository
```bash
git branch -M main
git remote add origin https://github.com/seanharsh/HA-SenseLike.git
```

### 3. Create Initial Release Tag
```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. Submit to HACS
1. Go to **https://hacs.xyz/publish**
2. Fill in the form:
   - **Repository URL:** `https://github.com/YOUR_USERNAME/senselike`
   - **Category:** `Lovelace (custom cards)`
   - **Click Submit**

3. HACS will verify your repository (takes 24-72 hours)
4. Once approved, your integration appears in HACS default repository
5. Users install via: **Settings → Devices & Services → HACS → Custom Repositories**

## 📦 Project Structure (HACS-Ready)

```
senselike/
├── www/
│   └── senselike-cards/
│       ├── senselike-usage-trend-card.js      ✓
│       ├── senselike-compare-card.js          ✓
│       ├── senselike-goals-card.js            ✓
│       ├── senselike-power-meter-card.js      ✓
│       ├── senselike-device-bubbles-card.js   ✓
│       └── senselike-timeline-card.js         ✓
├── README.md                                   ✓
├── example-dashboard.yaml                      ✓
├── hacs.json                                   ✓ NEW
├── LICENSE                                     ✓ NEW
├── CHANGELOG.md                                ✓ NEW
└── .gitignore                                  ✓ NEW
```

## 🔄 Future Updates

After HACS approval, updating is automatic:
1. Make code changes locally
2. Commit and push to GitHub
3. Create a new tag: `git tag v1.0.1 && git push origin v1.0.1`
4. HACS detects the tag and publishes as a new version
5. Users get automatic update notifications

## 📚 Additional Resources

- **HACS Documentation:** https://hacs.xyz/docs
- **Custom Card Devdocs:** https://developers.home-assistant.io/docs/frontend/custom-card/
- **Semantic Versioning:** https://semver.org

---

**Note:** The example dashboard uses placeholder entity IDs. Users will need to swap these with their own Sense/MQTT/statistics sensors before using.
