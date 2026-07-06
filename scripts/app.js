const navRoot = document.querySelector("#categoryNav");
const leadRoot = document.querySelector("#leadGrid");
const groupsRoot = document.querySelector("#newsGroups");
const counterRoot = document.querySelector("#newsCounter");

function currentFilter() {
  const hash = window.location.hash.replace("#", "");
  return CATEGORIES.some((category) => category.id === hash) ? hash : "all";
}

function renderCategoryNav() {
  const filters = [{ id: "all", name: "Все", cssVar: "--ink" }, ...CATEGORIES];
  navRoot.innerHTML = filters
    .map((category) => {
      const color = category.cssVar === "--ink" ? "var(--ink)" : `var(${category.cssVar})`;
      return `
        <button
          class="category-button"
          type="button"
          data-category="${category.id}"
          style="--category-color: ${color}"
          aria-pressed="false"
        >
          ${category.name}
        </button>
      `;
    })
    .join("");

  navRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    const categoryId = button.dataset.category;
    if (categoryId === "all") {
      history.pushState("", document.title, window.location.pathname);
    } else {
      window.location.hash = categoryId;
    }
    renderPage();
  });
}

function cardImage(newsItem, eager = false) {
  const image = getImage(newsItem.image);
  return `
    <div class="card-image">
      <img
        src="${image.url}"
        alt="${newsItem.imageAlt}"
        loading="${eager ? "eager" : "lazy"}"
      >
    </div>
  `;
}

function metaLine(newsItem) {
  const category = getCategory(newsItem.category);
  return `
    <div class="card-meta">
      <span class="tag">${category.name}</span>
      <time datetime="${newsItem.date}">${formatDate(newsItem.date)}</time>
      <span>${newsItem.city}</span>
    </div>
  `;
}

function newsCard(newsItem) {
  return `
    <a
      class="news-card"
      href="${articleUrl(newsItem)}"
      style="--category-color: ${getCategoryColor(newsItem.category)}"
    >
      ${cardImage(newsItem)}
      <div class="card-body">
        ${metaLine(newsItem)}
        <h3>${newsItem.title}</h3>
        <p class="summary">${newsItem.summary}</p>
        <span class="source-link">Фото: Wikimedia Commons</span>
      </div>
    </a>
  `;
}

function renderLead(items) {
  const sorted = getSortedNews(items);
  const [main, ...rest] = sorted.slice(0, 4);
  if (!main) {
    leadRoot.innerHTML = "";
    return;
  }

  leadRoot.innerHTML = `
    <a
      class="lead-card"
      href="${articleUrl(main)}"
      style="--category-color: ${getCategoryColor(main.category)}"
    >
      ${cardImage(main, true)}
      <div class="card-body">
        ${metaLine(main)}
        <h2>${main.title}</h2>
        <p class="summary">${main.summary}</p>
        <span class="read-link">Читать</span>
      </div>
    </a>
    <div class="lead-stack">
      ${rest
        .map(
          (item) => `
            <a
              class="lead-stack-item"
              href="${articleUrl(item)}"
              style="--category-color: ${getCategoryColor(item.category)}"
            >
              <img src="${getImage(item.image).url}" alt="${item.imageAlt}" loading="lazy">
              <div>
                ${metaLine(item)}
                <h3>${item.title}</h3>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderGroups() {
  const filter = currentFilter();
  const selectedCategories =
    filter === "all" ? CATEGORIES : CATEGORIES.filter((category) => category.id === filter);
  const visibleItems = filter === "all" ? NEWS : NEWS.filter((item) => item.category === filter);

  counterRoot.textContent = `${visibleItems.length} материалов`;

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.category === filter ? "true" : "false");
  });

  groupsRoot.innerHTML = selectedCategories
    .map((category) => {
      const categoryItems = getSortedNews(NEWS.filter((item) => item.category === category.id));
      if (!categoryItems.length) return "";

      return `
        <section
          class="category-section"
          style="--category-color: var(${category.cssVar})"
          aria-label="${category.name}"
        >
          <div class="category-title">
            <h2>${category.name}</h2>
            <span class="category-rule" aria-hidden="true"></span>
          </div>
          <div class="news-grid">
            ${categoryItems.map(newsCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderPage() {
  const filter = currentFilter();
  const items = filter === "all" ? NEWS : NEWS.filter((item) => item.category === filter);
  renderLead(items);
  renderGroups();
}

renderCategoryNav();
renderPage();
window.addEventListener("hashchange", renderPage);
