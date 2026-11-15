# Security policy · 安全策略 · Politique de sécurité

**简体中文** · [English](#english) · [Français](#français)

## 简体中文

### 数据与隐私
- 没有账号、没有后端、没有统计、没有自动更新。对话只存在你的电脑（桌面版数据目录 / 浏览器 IndexedDB）。
- 离开电脑的请求只有：① 发给你填的模型接口；② 你在「接口调试」卡点「发送」时，发给你填的地址（每次先确认）。
- 桌面版：沙盒窗口 + 网络总闸（`desktop/policy.js`）+ 拒绝所有权限请求 + 密钥放系统钥匙串；网页版：严格 CSP，密钥在浏览器本地（可选口令加密）。
- 学习台里模型写的代码：不透明来源 iframe + `connect-src 'none'`，读不到密钥、对话，也联不了网。
- 远程图片、外部脚本、外部字体一律不加载。`node tools/audit.mjs` 在 CI 里验证以上每一条。

### 安装包的来源与验证
- 只在本仓库 Releases 发布，由 GitHub Actions 构建，附 `SHA256SUMS.txt` 与构建证明（`gh attestation verify`）。网站部署包可本地 `node tools/pack-web.mjs` 复现，逐字节一致。
- 安装包**未做商业代码签名（Windows）、未经 Apple 公证（Mac）**，所以系统会弹安全提示。图示、每一步和取消办法见 [docs/DEPLOY.zh.md](docs/DEPLOY.zh.md#系统安全提示)。不放心可取消，改用网页版。

### 报告漏洞
请用 GitHub 的 **Security → Report a vulnerability**（私密报告），或到 [帮助中心联系我们](https://support.c0curic.top/contact)。请不要在公开 Issue 里贴可利用细节。我们会在收到后尽快确认并修复，修复发布后致谢（如你愿意）。
在范围内：桌面外壳、总闸绕过、学习台沙盒逃逸、密钥泄露、XSS、安装包 / 供应链问题。不在范围内：你自己填的第三方模型服务本身的问题。

## English

### Data and privacy
- No account, no backend, no analytics, no auto-update. Chats live only on your computer (desktop data folder / browser IndexedDB).
- Only these requests leave your machine: ① to the model URL you entered; ② to the address you typed when you press Send in the API debugger card (confirmed every time).
- Desktop: sandboxed windows + network gate (`desktop/policy.js`) + all permission requests denied + key in the OS keychain. Web: strict CSP, key in browser storage (optional passphrase encryption).
- Code the model writes in the study desk: opaque-origin iframe + `connect-src 'none'` — it cannot read your key or chats, and cannot go online.
- Remote images, external scripts and external fonts are never loaded. `node tools/audit.mjs` verifies each point in CI.

### Installer provenance and verification
- Published only in this repository's Releases, built by GitHub Actions, with `SHA256SUMS.txt` and a build attestation (`gh attestation verify`). The website bundle can be reproduced locally with `node tools/pack-web.mjs`, byte for byte.
- Installers are **not commercially code-signed (Windows) and not Apple-notarized (Mac)**, so the OS shows a security prompt. Pictures, every step and how to cancel: [docs/DEPLOY.en.md](docs/DEPLOY.en.md#system-security-prompts). If unsure, cancel and use the web edition.

### Reporting a vulnerability
Use GitHub **Security → Report a vulnerability** (private), or [contact us via the help center](https://support.c0curic.top/contact). Please do not post exploit details in public Issues. We confirm and fix as soon as we can and credit you after the fix ships, if you wish.
In scope: desktop shell, gate bypass, study-desk sandbox escape, key leakage, XSS, installer / supply-chain issues. Out of scope: problems in the third-party model service you configure.

## Français

### Données et confidentialité
- Pas de compte, pas de serveur, pas de statistiques, pas de mise à jour automatique. Les conversations restent sur votre ordinateur (dossier de données du bureau / IndexedDB du navigateur).
- Seules ces requêtes quittent votre machine : ① vers l’URL de modèle saisie ; ② vers l’adresse tapée quand vous appuyez sur Envoyer dans la carte débogueur d’API (confirmée à chaque fois).
- Bureau : fenêtres en bac à sable + portail réseau (`desktop/policy.js`) + toutes les demandes d’autorisation refusées + clé dans le trousseau du système. Web : CSP stricte, clé dans le stockage du navigateur (chiffrement par phrase secrète en option).
- Code écrit par le modèle dans le bureau d’étude : iframe à origine opaque + `connect-src 'none'` — il ne peut lire ni votre clé ni vos conversations, ni se connecter.
- Images distantes, scripts et polices externes ne sont jamais chargés. `node tools/audit.mjs` vérifie chaque point en CI.

### Provenance et vérification des installateurs
- Publiés uniquement dans les Releases de ce dépôt, construits par GitHub Actions, avec `SHA256SUMS.txt` et attestation de build (`gh attestation verify`). Le paquet web se reconstruit localement avec `node tools/pack-web.mjs`, octet pour octet.
- Les installateurs **n’ont pas de signature de code commerciale (Windows) et ne sont pas notarisés par Apple (Mac)** : le système affiche donc une alerte. Images, chaque étape et comment annuler : [docs/DEPLOY.fr.md](docs/DEPLOY.fr.md#alertes-de-sécurité-du-système). En cas de doute, annulez et utilisez la version web.

### Signaler une vulnérabilité
Utilisez **Security → Report a vulnerability** de GitHub (privé), ou [contactez-nous via le centre d’aide](https://support.c0curic.top/contact). Ne publiez pas de détails exploitables dans les Issues publiques. Nous confirmons et corrigeons dès que possible et vous créditons après publication du correctif, si vous le souhaitez.
Dans le périmètre : coque de bureau, contournement du portail, évasion du bac à sable du bureau d’étude, fuite de clé, XSS, installateur / chaîne d’approvisionnement. Hors périmètre : problèmes du service de modèle tiers que vous configurez.
