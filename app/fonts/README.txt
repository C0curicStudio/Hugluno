MaxRIous SC — 简体中文网站字体配套包

说明
- maxrious-400.ttf：你提供的 MaxRIous 原始字体，保留用于拉丁字母、数字和大部分西文符号。
- MaxRIous-SC-Chinese.otf：Noto Sans CJK SC 简体中文子集，覆盖 GB2312 可解码字符（约 7,445 个）及常用中英文标点/ASCII。中文采用克制、清晰的现代无衬线风格，适合长文本阅读。
- MaxRIous-SC.css：网站加载规则。两套字形会作为同一个 CSS 字体族使用；拉丁字符优先显示原 MaxRIous，中文使用简体中文字形。

使用
1. 将这三个文件放在网站同一个目录（或修改 CSS 中的 URL 路径）。
2. 在网页 HTML 的 head 中加入：
   <link rel="stylesheet" href="./MaxRIous-SC.css">
3. 设置 font-family: "MaxRIous SC", sans-serif; 或直接使用 CSS 中的 --font-ui。

覆盖范围说明
此版本优先覆盖 GB2312 常用简体中文字符，不包含繁体字扩展，也不是完整的 Unicode CJK 字库。极少见的人名、生僻字、部分扩展汉字和特殊符号可能回退到系统字体。若要更广泛覆盖，可改用完整 Noto Sans CJK SC，但文件体积会显著增加。

设计说明
这是一套字体配对方案，不是把 MaxRIous 的英文字形自动“变形”为原创中文字形。原字体字形保持不变，中文选用清晰、现代的简体无衬线字形，以保证混排协调与长文本可读性。

许可
MaxRIous 原字体按上传者提供的文件使用；请确认你拥有将其部署到网站的权利。
中文子集来源为 Noto Sans CJK SC。Noto CJK 按 SIL Open Font License 1.1 发布；分发时请保留其许可/归属信息。许可信息可查阅：https://github.com/notofonts/noto-cjk
