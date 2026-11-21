'use strict';
/* 三语界面（中文 / English / Français）。语言：用户选的 > 浏览器语言 > English。
   · L('key') 取界面文字；· t0('中文原文') 供工具卡（mxui.js）取译文。 */
(() => {
  const LANGS = { zh: '中文', en: 'English', fr: 'Français' };
  const pick = () => {
    try { const v = localStorage.getItem('hug.lang'); if (LANGS[v]) return v; } catch {}
    for (const l of (navigator.languages?.length ? navigator.languages : [navigator.language || 'en'])) {
      const n = String(l).toLowerCase();
      if (n.startsWith('zh')) return 'zh'; if (n.startsWith('fr')) return 'fr'; if (n.startsWith('en')) return 'en';
    }
    return 'en';
  };
  const lang = pick();
  // key: [中文, English, Français]
  const D = {
    app: ['Hugluno 快照版', 'Hugluno Snapshot', 'Hugluno Snapshot'],
    snap: ['开源快照版', 'Open-source snapshot', 'Édition snapshot open source'],
    newChat: ['新对话', 'New chat', 'Nouvelle conversation'],
    empty: ['还没有对话', 'No chats yet', 'Aucune conversation'],
    settings: ['设置', 'Settings', 'Réglages'],
    fullVer: ['在线完整版', 'Online full version', 'Version complète en ligne'],
    help: ['帮助中心', 'Help center', 'Centre d’aide'],
    tools: ['工具卡片', 'Tool cards', 'Cartes d’outils'],
    studyDesk: ['学习台', 'Study desk', 'Bureau d’étude'],
    studyNew: ['打开学习台', 'Open the study desk', 'Ouvrir le bureau d’étude'],
    send: ['发送', 'Send', 'Envoyer'],
    stop: ['停止', 'Stop', 'Arrêter'],
    ph: ['问点什么…（Enter 发送）', 'Ask anything… (Enter to send)', 'Posez une question… (Entrée)'],
    hello: ['你好，我是 Hugluno', 'Hi, I’m Hugluno', 'Bonjour, je suis Hugluno'],
    helloSub: ['这是纯本地的开源快照版：对话只存在你的电脑里，只有你选的模型服务商会收到你发的内容。', 'This is the fully local open-source snapshot: chats live only on your computer, and only the model provider you choose receives what you send.', 'Voici l’édition snapshot open source, 100 % locale : les conversations restent sur votre ordinateur et seul le fournisseur de modèle que vous choisissez reçoit vos messages.'],
    connectFirst: ['先连接一个模型', 'Connect a model first', 'Connectez d’abord un modèle'],
    connectSub: ['选一家服务商，粘贴你自己的密钥即可。密钥只发给这一家。', 'Pick a provider and paste your own key. The key is only ever sent to that provider.', 'Choisissez un fournisseur et collez votre propre clé. Elle n’est envoyée qu’à lui.'],
    openSettings: ['打开设置', 'Open settings', 'Ouvrir les réglages'],
    try1: ['做一个单摆的交互演示', 'Build an interactive pendulum demo', 'Crée une démo interactive de pendule'],
    try2: ['用看板帮我排期中考复习', 'Plan my exam revision on a task board', 'Planifie mes révisions sur un tableau de tâches'],
    try3: ['做一个 API 调试卡，请求 https://example.com', 'Open an API debugger for https://example.com', 'Ouvre un débogueur d’API pour https://example.com'],
    try4: ['做一个报名表单', 'Create a sign-up form', 'Crée un formulaire d’inscription'],
    // 设置
    sConn: ['模型连接', 'Model connection', 'Connexion au modèle'],
    sProvider: ['服务商', 'Provider', 'Fournisseur'],
    sBase: ['接口地址（OpenAI 兼容）', 'Base URL (OpenAI-compatible)', 'URL de base (compatible OpenAI)'],
    sKey: ['API 密钥', 'API key', 'Clé API'],
    sKeyHint: ['只保存在这台电脑里，只发给上面的接口地址。', 'Stored only on this computer and sent only to the URL above.', 'Stockée uniquement sur cet ordinateur et envoyée seulement à l’URL ci-dessus.'],
    sModel: ['模型', 'Model', 'Modèle'],
    sTest: ['测试连接', 'Test connection', 'Tester la connexion'],
    sSave: ['保存', 'Save', 'Enregistrer'],
    sClose: ['关闭', 'Close', 'Fermer'],
    sOk: ['连接成功', 'Connected', 'Connexion réussie'],
    sFail: ['连接失败', 'Connection failed', 'Échec de la connexion'],
    sModelsFound: ['个模型', ' models', ' modèles'],
    sPass: ['用口令加密保存密钥', 'Encrypt the key with a passphrase', 'Chiffrer la clé avec une phrase secrète'],
    sPassHint: ['每次打开要输入一次口令；忘了口令只能重新填密钥（网页版）。桌面版用系统钥匙串保存，无需口令。', 'You enter the passphrase once per launch; if you forget it you must re-enter the key (web). The desktop app uses the system keychain and needs none.', 'La phrase secrète est demandée à chaque ouverture ; en cas d’oubli, ressaisissez la clé (version web). L’application de bureau utilise le trousseau du système.'],
    sPassAsk: ['输入口令解锁密钥', 'Enter the passphrase to unlock the key', 'Saisissez la phrase secrète pour déverrouiller la clé'],
    sPassSet: ['设置口令', 'Set a passphrase', 'Définir une phrase secrète'],
    sBehave: ['对话', 'Chat', 'Conversation'],
    sSystem: ['系统提示词（可选）', 'System prompt (optional)', 'Message système (facultatif)'],
    sTemp: ['温度', 'Temperature', 'Température'],
    sLang: ['语言', 'Language', 'Langue'],
    sTheme: ['外观', 'Appearance', 'Apparence'],
    tAuto: ['跟随系统', 'System', 'Système'],
    tLight: ['浅色', 'Light', 'Clair'],
    tDark: ['深色', 'Dark', 'Sombre'],
    agent: ['Agent', 'Agent', 'Agent'],
    agentTip: ['本地 Agent：在你选的文件夹里读写文件、（可选）运行命令。点一下开 / 关', 'Local Agent: reads and writes files in the folder you chose and (optionally) runs commands. Click to turn on / off', 'Agent local : lit et écrit des fichiers dans le dossier choisi et (en option) exécute des commandes. Cliquez pour activer / désactiver'],
    agNeedDir: ['先在 设置 → 本地 Agent 里选一个工作文件夹', 'First choose a working folder in Settings → Local Agent', 'Choisissez d’abord un dossier de travail dans Réglages → Agent local'],
    agNoTools: ['这个模型不支持工具调用（function calling），本地 Agent 用不了；换一个支持的模型试试', 'This model does not support tool calling (function calling), so the local Agent can’t use it — try a model that does', 'Ce modèle ne prend pas en charge l’appel d’outils (function calling) ; l’agent local ne peut pas l’utiliser — essayez-en un autre'],
    agMaxSteps: ['（已到 25 步上限，先停在这里；发「继续」接着做）', '(Reached the 25-step limit — stopping here; send “continue” to keep going)', '(Limite de 25 étapes atteinte — arrêt ici ; envoyez « continuer » pour poursuivre)'],
    sAgent: ['本地 Agent', 'Local Agent', 'Agent local'],
    sAgentDir: ['工作文件夹', 'Working folder', 'Dossier de travail'],
    sAgentPick: ['选择文件夹…', 'Choose folder…', 'Choisir un dossier…'],
    sAgentNone: ['（还没选）', '(none yet)', '(aucun)'],
    sAgentCmd: ['允许运行命令（每一条都会先问你）', 'Allow running commands (asks you before every one)', 'Autoriser les commandes (demande avant chacune)'],
    sAgentCmdHint: ['命令由系统 shell 执行，它自己的联网不经过 Hugluno 的网络总闸；提权、格式化、下载即执行这类命令一律拦下。', 'Commands run in your system shell; their own network access does not pass through Hugluno’s network gate. Privilege escalation, disk formatting and download-and-run commands are always blocked.', 'Les commandes s’exécutent dans le shell du système ; leur accès réseau ne passe pas par la barrière réseau de Hugluno. Élévation de privilèges, formatage de disque et « télécharger puis exécuter » sont toujours bloqués.'],
    sAgentHint: ['精简版：一个模型、一个对话循环，没有工作流。只在这个文件夹里读写；删除文件每次都问；密钥和登录类文件不碰；每次操作记在本机的 agent-audit.log。', 'Lite edition: one model, one chat loop, no workflows. Works only inside this folder; asks before every delete; never touches key or login files; every action is logged locally in agent-audit.log.', 'Édition allégée : un modèle, une boucle de conversation, pas de workflows. Travaille uniquement dans ce dossier ; demande avant chaque suppression ; ne touche jamais aux fichiers de clés ou de connexion ; chaque action est consignée localement dans agent-audit.log.'],
    standbyOn: ['静默待机：你工作时留意报错，有问题轻轻提醒', 'Silent standby: watch for errors while you work and nudge you', 'Veille discrète : surveille les erreurs pendant que vous travaillez et vous prévient'],
    standbyHint: ['默认关闭。打开后每 20 秒在本机读一次最前面窗口的标题（不发出去）；只有标题像报错时，才截一张屏交给你填的模型判断，真有问题才亮黄灯、发通知，点了才看解决办法。', 'Off by default. When on, every 20 s it reads the front window title locally (never sent). Only when the title looks like an error is one screenshot sent to the model you configured; if there is really a problem, Lunosland turns amber and a notification appears — click to see the fix.', 'Désactivée par défaut. Activée, elle lit toutes les 20 s le titre de la fenêtre au premier plan, en local (jamais envoyé). Seulement si le titre ressemble à une erreur, une capture est envoyée au modèle que vous avez configuré ; en cas de vrai problème, Lunosland passe à l’orange et une notification apparaît — cliquez pour voir la solution.'],
    standbyTitle: ['静默待机发现的问题', 'Found by silent standby', 'Repéré par la veille discrète'],
    sPrivacy: ['隐私与数据', 'Privacy & data', 'Confidentialité et données'],
    sNetLog: ['网络记录（本次打开以来程序发出的每一个请求）', 'Network log (every request this app made since it opened)', 'Journal réseau (chaque requête faite depuis l’ouverture)'],
    sNetNone: ['还没有任何请求。', 'No requests yet.', 'Aucune requête pour l’instant.'],
    sExport: ['导出全部对话（JSON）', 'Export all chats (JSON)', 'Exporter toutes les conversations (JSON)'],
    sImport: ['导入对话', 'Import chats', 'Importer des conversations'],
    sWipe: ['清除本机全部数据', 'Erase all data on this device', 'Effacer toutes les données de cet appareil'],
    sWipeAsk: ['确定清除？对话、密钥、设置都会删除，且无法恢复。', 'Erase everything? Chats, key and settings will be deleted and cannot be recovered.', 'Tout effacer ? Conversations, clé et réglages seront supprimés définitivement.'],
    sWiped: ['已清除', 'Erased', 'Effacé'],
    sAbout: ['关于', 'About', 'À propos'],
    aboutText: ['开源快照版 · 纯本地 · 无账号、无订阅、无代理、无统计。代码全部公开，欢迎审查。© 2026 C0curic Studio · 仅限非商业使用（PolyForm 非商业许可 1.0.0）。', 'Open-source snapshot · fully local · no account, no subscription, no proxy, no analytics. All code is public — audit it. © 2026 C0curic Studio · noncommercial use only (PolyForm Noncommercial 1.0.0).', 'Édition snapshot open source · 100 % locale · sans compte, abonnement, proxy ni statistiques. Tout le code est public — auditez-le. © 2026 C0curic Studio · usage non commercial uniquement (PolyForm Noncommercial 1.0.0).'],
    linkLicense: ['版权与许可', 'Copyright & license', 'Droits d’auteur et licence'],
    linkRepo: ['GitHub 源码', 'Source on GitHub', 'Code source sur GitHub'],
    linkPrivacy: ['隐私政策', 'Privacy policy', 'Politique de confidentialité'],
    linkSafety: ['安装安全提示', 'Install security prompts', 'Alertes de sécurité à l’installation'],
    linkDeploy: ['部署教程', 'Deployment guide', 'Guide de déploiement'],
    learnMore: ['了解更多', 'Learn more', 'En savoir plus'],
    // 对话
    delChat: ['删除这个对话', 'Delete this chat', 'Supprimer cette conversation'],
    delAsk: ['删除这个对话？', 'Delete this chat?', 'Supprimer cette conversation ?'],
    del: ['删除', 'Delete', 'Supprimer'],
    cancel: ['取消', 'Cancel', 'Annuler'],
    copy: ['复制', 'Copy', 'Copier'],
    copied: ['已复制', 'Copied', 'Copié'],
    regen: ['重新生成', 'Regenerate', 'Régénérer'],
    thinking: ['思考过程', 'Reasoning', 'Raisonnement'],
    noKey: ['还没有连接模型：先到设置里填接口地址、密钥和模型。', 'No model connected yet: open Settings and enter a base URL, key and model.', 'Aucun modèle connecté : ouvrez les Réglages et saisissez l’URL, la clé et le modèle.'],
    errPrefix: ['出错了：', 'Error: ', 'Erreur : '],
    errCors: ['浏览器拦截了这次请求（跨域 CORS）。这个服务商不允许网页直接调用——请改用桌面版，或换一个允许的服务商。', 'The browser blocked this request (CORS). This provider does not allow direct calls from web pages — use the desktop app or another provider.', 'Le navigateur a bloqué la requête (CORS). Ce fournisseur n’autorise pas les appels directs depuis une page web — utilisez l’application de bureau ou un autre fournisseur.'],
    errHttp: ['服务商返回 ', 'The provider returned ', 'Le fournisseur a répondu '],
    stopped: ['已停止', 'Stopped', 'Arrêté'],
    // 联网确认
    netAsk: ['要向这个地址发送请求吗？', 'Send a request to this address?', 'Envoyer une requête à cette adresse ?'],
    netAskSub: ['这是「接口调试」卡的发送按钮触发的，请求会离开你的电脑。', 'Triggered by the API debugger’s Send button — the request will leave your computer.', 'Déclenchée par le bouton Envoyer du débogueur d’API — la requête quittera votre ordinateur.'],
    netAllow: ['发送', 'Send', 'Envoyer'],
    // 仅电脑端
    deskOnly: ['请在电脑上打开', 'Please open this on a computer', 'Veuillez ouvrir ceci sur un ordinateur'],
    deskOnlySub: ['开源快照版只为电脑端（Windows / Mac / 桌面浏览器）设计和适配，手机和平板暂不支持。', 'The open-source snapshot is designed for desktop only (Windows / Mac / desktop browsers). Phones and tablets are not supported.', 'L’édition snapshot open source est conçue pour ordinateur uniquement (Windows / Mac / navigateurs de bureau). Téléphones et tablettes non pris en charge.'],
    deskOnlyFull: ['手机上请用在线完整版 →', 'On a phone, use the online full version →', 'Sur téléphone, utilisez la version complète en ligne →'],
    // 卡片 / 工作台
    cardsMenu: ['打开一张工具卡', 'Open a tool card', 'Ouvrir une carte d’outil'],
    cApi: ['接口调试', 'API debugger', 'Débogueur d’API'],
    cKanban: ['任务看板', 'Task board', 'Tableau de tâches'],
    cVideo: ['视频剪辑', 'Video editor', 'Montage vidéo'],
    cDiff: ['代码比对', 'Code diff', 'Comparaison de code'],
    cForm: ['动态表单', 'Dynamic form', 'Formulaire dynamique'],
    labSample: ['单摆演示（示例）', 'Pendulum demo (sample)', 'Démo du pendule (exemple)'],
    islandOn: ['Lunosland 悬浮岛', 'Lunosland floating island', 'Île flottante Lunosland'],
    islandHint: ['屏幕顶部的小岛：悬停展开，输入一句话回车，交给这里的对话发送。仅桌面版。', 'A small island at the top of the screen: hover to expand, type a line and press Enter to send it to this chat. Desktop app only.', 'Une petite île en haut de l’écran : survolez, tapez une ligne et appuyez sur Entrée pour l’envoyer ici. Application de bureau uniquement.'],
  };
  const idx = { zh: 0, en: 1, fr: 2 }[lang];
  const L = k => (D[k] ? D[k][idx] : k);
  const cards = window.HUG_CARDS_I18N || {};
  const t0 = zh => (lang === 'zh' ? zh : (cards[zh] ? cards[zh][idx - 1] : zh));
  Object.assign(window, { L, t0, HUG_LANG: lang, HUG_LANGS: LANGS, HUG_DICT: D });
  document.documentElement.lang = { zh: 'zh-CN', en: 'en', fr: 'fr' }[lang];
  window.hugSetLang = v => { if (!LANGS[v]) return; try { localStorage.setItem('hug.lang', v); } catch {} location.reload(); };
  // 静态文字：<... data-i="key"> 的内容、data-ph / data-title
  window.hugTranslate = (root = document) => {
    root.querySelectorAll('[data-i]').forEach(e => { e.textContent = L(e.dataset.i); });
    root.querySelectorAll('[data-ph]').forEach(e => { e.placeholder = L(e.dataset.ph); });
    root.querySelectorAll('[data-title]').forEach(e => { e.title = L(e.dataset.title); e.setAttribute('aria-label', e.title); });
  };
})();
