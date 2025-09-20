const urlInput = document.querySelector('#url-input');
const searchButton = document.querySelector('#search-button');
const summaryOutput = document.querySelector('#summary-output');
const validationMessage = document.querySelector('#validation-message');
const resetButton = document.querySelector('#reset-button');
const summaryTemplate = document.querySelector('#summary-template');

function setLoadingState(isLoading) {
  if (isLoading) {
    summaryOutput.innerHTML = '';
    summaryOutput.appendChild(createLoadingNode());
    searchButton.disabled = true;
  } else {
    searchButton.disabled = false;
  }
}

function createLoadingNode() {
  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = 'ページを要約しています…';
  return loading;
}

function showValidation(message) {
  validationMessage.textContent = message;
}

function clearSummary() {
  summaryOutput.innerHTML = '';
  summaryOutput.appendChild(createPlaceholder());
}

function createPlaceholder() {
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = 'まだサマリーはありません。URLを入力して検索してください。';
  return placeholder;
}

async function requestSummary(url) {
  const response = await fetch(`/api/summarize?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: '不明なエラーが発生しました。' }));
    throw new Error(errorData.message || '要約の取得に失敗しました。');
  }
  return response.json();
}

function populateSummary({ title, text, sourceUrl }) {
  summaryOutput.innerHTML = '';
  const fragment = summaryTemplate.content.cloneNode(true);
  fragment.querySelector('.summary-title').textContent = title || 'タイトルが見つかりません';
  fragment.querySelector('.summary-url').textContent = sourceUrl;
  fragment.querySelector('.summary-text').textContent = text || '本文が取得できませんでした。';
  summaryOutput.appendChild(fragment);
}

async function handleSearch(event) {
  event.preventDefault();
  const url = urlInput.value.trim();

  if (!url) {
    showValidation('URLを入力してください。');
    return;
  }

  try {
    new URL(url);
  } catch (error) {
    showValidation('正しい形式のURLを入力してください。');
    return;
  }

  showValidation('');
  setLoadingState(true);

  try {
    const result = await requestSummary(url);
    populateSummary(result);
  } catch (error) {
    summaryOutput.innerHTML = '';
    const message = document.createElement('p');
    message.className = 'placeholder';
    message.textContent = error.message;
    summaryOutput.appendChild(message);
  } finally {
    setLoadingState(false);
  }
}

function init() {
  clearSummary();
  searchButton.addEventListener('click', handleSearch);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      handleSearch(event);
    }
  });
  resetButton.addEventListener('click', () => {
    urlInput.value = '';
    showValidation('');
    clearSummary();
    urlInput.focus();
  });
}

init();
