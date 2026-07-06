const articleRoot = document.querySelector("#articleRoot");
const relatedRoot = document.querySelector("#relatedNews");
const params = new URLSearchParams(window.location.search);
const articleId = params.get("id");
const article = NEWS.find((item) => item.id === articleId);

function renderMissingArticle() {
  document.title = "Новость не найдена | Ханган Дейли";
  articleRoot.className = "empty-state";
  articleRoot.innerHTML = `
    <h1>Новость не найдена</h1>
    <p class="muted">Материал мог быть снят с публикации или ссылка была набрана с ошибкой.</p>
    <a class="read-link" href="index.html">Вернуться к архиву</a>
  `;
  relatedRoot.innerHTML = "";
}

function renderArticle(newsItem) {
  const category = getCategory(newsItem.category);
  const image = getImage(newsItem.image);
  document.title = `${newsItem.title} | Ханган Дейли`;

  articleRoot.innerHTML = `
    <div class="article-hero">
      <img src="${image.url}" alt="${newsItem.imageAlt}" loading="eager">
    </div>
    <div class="article-content" style="--category-color: ${getCategoryColor(newsItem.category)}">
      <div class="article-meta">
        <span class="tag">${category.name}</span>
        <time datetime="${newsItem.date}">${formatDate(newsItem.date)}</time>
        <span>${newsItem.city}</span>
      </div>
      <h1>${newsItem.title}</h1>
      <p class="article-summary">${newsItem.summary}</p>
      ${newsItem.body.map((paragraph) => `<p>${paragraph}</p>`).join("")}
      <div class="article-byline">
        <p>Ханган Дейли, игровая редакция. Фото: <a href="${image.page}" target="_blank" rel="noreferrer">Wikimedia Commons</a>.</p>
      </div>
    </div>
  `;
}

function renderRelated(newsItem) {
  const related = getSortedNews(NEWS)
    .filter((item) => item.category === newsItem.category && item.id !== newsItem.id)
    .slice(0, 3);

  relatedRoot.innerHTML = related
    .map((item) => {
      const category = getCategory(item.category);
      return `
        <a
          class="news-card"
          href="${articleUrl(item)}"
          style="--category-color: ${getCategoryColor(item.category)}"
        >
          <div class="card-image">
            <img src="${getImage(item.image).url}" alt="${item.imageAlt}" loading="lazy">
          </div>
          <div class="card-body">
            <div class="card-meta">
              <span class="tag">${category.name}</span>
              <time datetime="${item.date}">${formatDate(item.date)}</time>
            </div>
            <h3>${item.title}</h3>
            <p class="summary">${item.summary}</p>
          </div>
        </a>
      `;
    })
    .join("");
}

if (article) {
  renderArticle(article);
  renderRelated(article);
} else {
  renderMissingArticle();
}
