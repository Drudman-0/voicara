
/* =========================================
   VOICARA SA NATIONAL NEWSROOM
   File: frontend/newsroom.js
========================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "https://voicara-backend.onrender.com";

  const newsGrid = document.getElementById("newsGrid");
  const newsStatus = document.getElementById("newsStatus");
  const searchForm = document.getElementById("newsSearchForm");
  const searchInput = document.getElementById("newsSearch");
  const provinceFilter = document.getElementById("provinceFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const resetButton = document.getElementById("resetNewsFilters");
  const loadMoreButton = document.getElementById("loadMoreNews");
  const menuToggle = document.getElementById("menuToggle");
  const navigation = document.getElementById("primaryNavigation");
  const currentYear = document.getElementById("currentYear");

  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  /* Mobile navigation */

  if (menuToggle && navigation) {
    menuToggle.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("mobile-open");

      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation menu" : "Open navigation menu"
      );
      menuToggle.textContent = isOpen ? "✕" : "☰";
    });

    navigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navigation.classList.remove("mobile-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation menu");
        menuToggle.textContent = "☰";
      });
    });
  }

  /* Newsroom state */

  let allArticles = [];
  let visibleCount = 9;
  const pageSize = 9;

  const provinceNames = {
    national: "National",
    "eastern-cape": "Eastern Cape",
    "free-state": "Free State",
    gauteng: "Gauteng",
    "kwazulu-natal": "KwaZulu-Natal",
    limpopo: "Limpopo",
    mpumalanga: "Mpumalanga",
    "northern-cape": "Northern Cape",
    "north-west": "North West",
    "western-cape": "Western Cape"
  };

  const categoryNames = {
    politics: "Politics & Government",
    community: "Community",
    education: "Education",
    business: "Business & Economy",
    health: "Health",
    crime: "Crime & Justice",
    "gender-based-violence": "Gender-Based Violence",
    environment: "Environment",
    technology: "Technology",
    sport: "Sport"
  };

  /* Safely display text from news sources */

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function normaliseArticle(article) {
    if (!article || typeof article !== "object") {
      return null;
    }

    const title = String(article.title || "").trim();
    const url = String(
      article.url || article.link || article.articleUrl || ""
    ).trim();

    if (!title || !isSafeExternalUrl(url)) {
      return null;
    }

    return {
      id: article.id || article.guid || url,
      title,
      description: String(
        article.description ||
        article.summary ||
        article.contentSnippet ||
        "Read the original report for more information."
      ).trim(),
      url,
      image: isSafeImageUrl(article.image || article.imageUrl || article.thumbnail)
        ? article.image || article.imageUrl || article.thumbnail
        : "",
      source: String(
        article.source || article.publisher || article.sourceName || "Original publisher"
      ).trim(),
      publishedAt: article.publishedAt || article.pubDate || article.date || "",
      province: normaliseFilterValue(article.province || "national"),
      category: normaliseFilterValue(article.category || "community")
    };
  }

  function isSafeExternalUrl(value) {
    try {
      const url = new URL(value);

      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function isSafeImageUrl(value) {
    if (!value) return false;

    try {
      const url = new URL(value, window.location.origin);

      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function normaliseFilterValue(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function formatDate(value) {
    if (!value) return "Recent report";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Recent report";
    }

    return new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function matchesFilters(article) {
    const searchTerm = (searchInput?.value || "")
      .toLowerCase()
      .trim();

    const selectedProvince = provinceFilter?.value || "all";
    const selectedCategory = categoryFilter?.value || "all";

    const searchableText = [
      article.title,
      article.description,
      article.source,
      article.province,
      article.category
    ].join(" ").toLowerCase();

    const matchesSearch =
      !searchTerm || searchableText.includes(searchTerm);

    const matchesProvince =
      selectedProvince === "all" ||
      article.province === selectedProvince;

    const matchesCategory =
      selectedCategory === "all" ||
      article.category === selectedCategory;

    return matchesSearch && matchesProvince && matchesCategory;
  }

  /* Build article cards without inserting publisher HTML */

  function createArticleCard(article) {
    const card = createElement("article", "news-card");

    if (article.image) {
      const image = createElement("img", "news-card-image");

      image.src = article.image;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      image.addEventListener("error", () => {
        image.remove();
      });

      card.appendChild(image);
    }

    const content = createElement("div", "news-card-content");
    const metadata = createElement("div", "news-card-meta");

    const categoryLabel =
      categoryNames[article.category] || "Latest News";

    metadata.appendChild(
      createElement("span", "news-category", categoryLabel)
    );

    metadata.appendChild(
      createElement("span", "", formatDate(article.publishedAt))
    );

    content.appendChild(metadata);
    content.appendChild(createElement("h3", "", article.title));
    content.appendChild(
      createElement("p", "", article.description)
    );

    const source = createElement(
      "div",
      "news-card-source",
      "Source: " + article.source
    );

    content.appendChild(source);

    const link = createElement(
      "a",
      "news-card-link",
      "Read original article →"
    );

    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    content.appendChild(link);
    card.appendChild(content);

    return card;
  }

  /* Render filtered news */

  function renderNews() {
    if (!newsGrid) return;

    const filteredArticles = allArticles.filter(matchesFilters);
    const articlesToShow = filteredArticles.slice(0, visibleCount);

    newsGrid.replaceChildren();

    if (articlesToShow.length === 0) {
      const empty = createElement("div", "news-empty");

      empty.appendChild(
        createElement("h3", "", "No matching news found")
      );

      empty.appendChild(
        createElement(
          "p",
          "",
          allArticles.length === 0
            ? "No news articles are currently available. Please check back later."
            : "Try another search term or change your filters."
        )
      );

      newsGrid.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();

      articlesToShow.forEach((article) => {
        fragment.appendChild(createArticleCard(article));
      });

      newsGrid.appendChild(fragment);
    }

    if (newsStatus) {
      newsStatus.textContent =
        filteredArticles.length +
        (filteredArticles.length === 1
          ? " article found"
          : " articles found");
    }

    if (loadMoreButton) {
      loadMoreButton.hidden = articlesToShow.length >= filteredArticles.length;
    }
  }

  function resetPagination() {
    visibleCount = pageSize;
    renderNews();
  }

  /* Load articles from the backend */

  async function loadNews() {
    if (!newsGrid) return;

    newsGrid.replaceChildren();

    const loading = createElement("div", "news-empty");

    loading.appendChild(
      createElement("h3", "", "Loading the newsroom...")
    );

    loading.appendChild(
      createElement(
        "p",
        "",
        "Connecting to the VOICARA SA news service."
      )
    );

    newsGrid.appendChild(loading);

    if (newsStatus) {
      newsStatus.textContent = "Connecting...";
    }

    try {
      const response = await fetch(`${API_BASE}/api/news`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`News service returned ${response.status}`);
      }

      const result = await response.json();

      const articles = Array.isArray(result)
        ? result
        : Array.isArray(result.articles)
          ? result.articles
          : Array.isArray(result.news)
            ? result.news
            : [];

      allArticles = articles
        .map(normaliseArticle)
        .filter(Boolean);

      allArticles.sort((a, b) => {
        const dateA = new Date(a.publishedAt).getTime() || 0;
        const dateB = new Date(b.publishedAt).getTime() || 0;

        return dateB - dateA;
      });

      resetPagination();
    } catch (error) {
      console.error("VOICARA SA newsroom:", error);

      newsGrid.replaceChildren();

      const errorBox = createElement("div", "news-empty");

      errorBox.appendChild(
        createElement("h3", "", "News is temporarily unavailable")
      );

      errorBox.appendChild(
        createElement(
          "p",
          "",
          "The newsroom could not connect to its news service. Please try again later."
        )
      );

      const retryButton = createElement("button", "", "Try again");
      retryButton.type = "button";

      retryButton.addEventListener("click", loadNews);

      errorBox.appendChild(retryButton);
      newsGrid.appendChild(errorBox);

      if (newsStatus) {
        newsStatus.textContent = "Connection unavailable";
      }

      if (loadMoreButton) {
        loadMoreButton.hidden = true;
      }
    }
  }

  /* Search and filter controls */

  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      resetPagination();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", resetPagination);
  }

  if (provinceFilter) {
    provinceFilter.addEventListener("change", resetPagination);
  }

  if (categoryFilter) {
    categoryFilter.addEventListener("change", resetPagination);
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (provinceFilter) provinceFilter.value = "all";
      if (categoryFilter) categoryFilter.value = "all";

      resetPagination();
    });
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      visibleCount += pageSize;
      renderNews();
    });
  }

  /* Start the newsroom */

  loadNews();
});
