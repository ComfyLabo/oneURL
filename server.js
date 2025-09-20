const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

app.get('/api/summarize', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ message: 'URLを指定してください。' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (error) {
    return res.status(400).json({ message: '正しい形式のURLを入力してください。' });
  }

  try {
    const response = await fetch(parsedUrl.href, {
      redirect: 'follow',
      timeout: 15000,
      headers: {
        'User-Agent': 'oneURL-summarizer/0.1 (+https://example.com)'
      }
    });

    if (!response.ok) {
      return res
        .status(502)
        .json({ message: `ページの取得に失敗しました。(HTTP ${response.status})` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.status(415).json({ message: 'HTMLページ以外は要約できません。' });
    }

    const html = await response.text();
    const dom = new JSDOM(html, {
      url: parsedUrl.href,
      contentType: 'text/html'
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const fallbackTitle = (dom.window.document.querySelector('title') || {}).textContent || parsedUrl.hostname;
    const rawText = (article && article.textContent) || dom.window.document.body.textContent || '';

    if (!rawText.trim()) {
      return res.status(422).json({ message: '本文が見つかりませんでした。' });
    }

    const summaryText = await generateSummary(rawText, parsedUrl.href);

    res.json({
      title: (article && article.title) || fallbackTitle,
      text: summaryText,
      sourceUrl: parsedUrl.href
    });
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({ message: 'サマリーの生成に失敗しました。' });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

async function generateSummary(text, sourceUrl) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const summary = await summarizeWithGemini(text, sourceUrl);
      return toSingleLine(summary);
    } catch (error) {
      console.error('Gemini API summary failed, falling back to local summary:', error);
    }
  }

  return summarizeTextLocally(text);
}

async function summarizeWithGemini(text, sourceUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const truncated = truncateForGemini(text);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildGeminiPrompt(truncated, sourceUrl);
  const result = await model.generateContent(prompt);
  const summary = result?.response?.text();

  if (!summary) {
    throw new Error('Gemini API returned empty response.');
  }

  return toSingleLine(summary);
}

function buildGeminiPrompt(text, sourceUrl) {
  const instructions = [
    '次のウェブページ本文を日本語で要約してください。',
    '重要なキーワードを残しつつポイントを含め、改行せず一行で120文字以内に収めてください。',
    `元のURL: ${sourceUrl}`,
    '',
    '--- 本文 ---',
    text
  ].join('\n');

  return instructions;
}

function truncateForGemini(text) {
  const maxChars = Number(process.env.GEMINI_MAX_CHARS || 12000);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n...（本文はここで省略されました）`;
}

function summarizeTextLocally(text) {
  const normalized = text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!normalized) {
    return '本文が取得できませんでした。';
  }

  const sentences = normalized.match(/[^。！？!?\n]+[。！？!?]?/g) || [normalized];
  const summarySentences = [];
  for (const sentence of sentences) {
    const cleaned = sentence.trim();
    if (!cleaned) {
      continue;
    }
    summarySentences.push(cleaned);
    const current = summarySentences.join(' ');
    if (current.length >= 120 || summarySentences.length >= 2) {
      break;
    }
  }

  let summary = summarySentences.join(' ');
  if (summary.length > 120) {
    summary = `${summary.slice(0, 117)}…`;
  }

  return summary || normalized.slice(0, 120);
}

function toSingleLine(text) {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
