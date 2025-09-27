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
  let summary;
  if (process.env.GEMINI_API_KEY) {
    try {
      summary = await summarizeWithGemini(text, sourceUrl);
    } catch (error) {
      console.error('Gemini API summary failed, falling back to local summary:', error);
    }
  }

  if (!summary) {
    summary = summarizeTextLocally(text);
  }

  return formatSummary(summary);
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

  return summary.trim();
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

  const sentences = normalized.match(/[^。！？!?\n]+[。！？!?]?/g) || [];
  const cleanedSentences = sentences
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!cleanedSentences.length) {
    return normalized;
  }

  if (cleanedSentences.length === 1) {
    return cleanedSentences[0];
  }

  const tokenFrequency = buildTokenFrequency(cleanedSentences);
  const scored = cleanedSentences
    .map((sentence, index) => ({
      sentence,
      score: scoreSentence(sentence, index, tokenFrequency)
    }))
    .sort((a, b) => b.score - a.score);

  const bestSentence = (scored[0] && scored[0].sentence) || cleanedSentences[0];
  return bestSentence;
}

function buildTokenFrequency(sentences) {
  const frequency = new Map();
  for (const sentence of sentences) {
    const tokens = extractTokens(sentence);
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }
  return frequency;
}

function scoreSentence(sentence, index, frequency) {
  const tokens = extractTokens(sentence);
  if (!tokens.length) {
    return 0;
  }

  const keywordScore = tokens.reduce((sum, token) => sum + (frequency.get(token) || 0), 0);
  const idealLength = Number(process.env.SUMMARY_IDEAL_LENGTH || 80);
  const lengthPenalty = Math.abs(sentence.length - idealLength) * 0.05;
  const positionBoost = index === 0 ? 1.1 : index === 1 ? 1.05 : 1;

  return keywordScore * positionBoost - lengthPenalty;
}

function extractTokens(sentence) {
  return (
    sentence.match(/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}a-zA-Z0-9]{2,}/gu) || []
  ).map((token) => token.toLowerCase());
}

function toSingleLine(text) {
  return text.replace(/[\s\u3000]+/gu, ' ').trim();
}

function formatSummary(text) {
  if (!text) {
    return '本文が取得できませんでした。';
  }

  const maxChars = Number(process.env.SUMMARY_MAX_CHARS || 120);
  let singleLine = toSingleLine(text);

  if (singleLine.length > maxChars) {
    const safeLength = Math.max(1, maxChars - 1);
    singleLine = `${singleLine.slice(0, safeLength)}…`;
  }

  return singleLine;
}
