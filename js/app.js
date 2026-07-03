(function () {
  "use strict";

  var MAX_FILES = 10;
  var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  var ALLOWED_EXT = [".txt", ".csv"];
  var API_KEY_STORAGE = "paydoc_api_key";
  var MODEL = "claude-sonnet-4-6";
  var API_URL = "https://api.anthropic.com/v1/messages";

  var uploadedFiles = []; // { id, name, size, content }
  var lastResultText = "";

  // ============ ROUTING ============
  function navigate(page) {
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.toggle("active", el.id === "page-" + page);
    });
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.dataset.page === page);
    });
    document.getElementById("navLinks").classList.remove("open");
    window.scrollTo(0, 0);
  }

  function currentPageFromHash() {
    var hash = (window.location.hash || "#home").replace("#", "");
    var valid = ["home", "analyzer", "instructions", "about"];
    return valid.indexOf(hash) !== -1 ? hash : "home";
  }

  window.addEventListener("hashchange", function () {
    navigate(currentPageFromHash());
  });

  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-page]");
    if (link) {
      // let default hash navigation happen, then sync
      setTimeout(function () { navigate(currentPageFromHash()); }, 0);
    }
  });

  document.getElementById("navToggle").addEventListener("click", function () {
    document.getElementById("navLinks").classList.toggle("open");
  });

  // ============ API KEY ============
  var apiKeyInput = document.getElementById("apiKeyInput");
  var rememberKey = document.getElementById("rememberKey");
  var apiKeyBanner = document.getElementById("apiKeyBanner");

  function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || sessionStorage.getItem(API_KEY_STORAGE) || "";
  }

  function loadApiKeyUI() {
    var key = getApiKey();
    if (key) {
      apiKeyInput.value = key;
      apiKeyBanner.querySelector("strong").textContent = "Ключ Anthropic API сохранён.";
    }
  }

  document.getElementById("saveApiKeyBtn").addEventListener("click", function () {
    var key = apiKeyInput.value.trim();
    if (!key) {
      showAlert("error", "Введите API-ключ перед сохранением.");
      return;
    }
    localStorage.removeItem(API_KEY_STORAGE);
    sessionStorage.removeItem(API_KEY_STORAGE);
    if (rememberKey.checked) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      sessionStorage.setItem(API_KEY_STORAGE, key);
    }
    showAlert("success", "Ключ сохранён в этом браузере.");
  });

  loadApiKeyUI();

  // ============ FILE UPLOAD ============
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var fileList = document.getElementById("fileList");
  var fileCount = document.getElementById("fileCount");
  var analyzeBtn = document.getElementById("analyzeBtn");

  dropzone.addEventListener("click", function () { fileInput.click(); });

  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener("change", function () {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });

  function extOf(name) {
    var idx = name.lastIndexOf(".");
    return idx === -1 ? "" : name.slice(idx).toLowerCase();
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(2) + " МБ";
  }

  function handleFiles(fileListRaw) {
    var files = Array.prototype.slice.call(fileListRaw);
    if (!files.length) return;

    if (uploadedFiles.length + files.length > MAX_FILES) {
      showAlert("error", "Максимум " + MAX_FILES + " файлов одновременно.");
      return;
    }

    files.forEach(function (file) {
      if (ALLOWED_EXT.indexOf(extOf(file.name)) === -1) {
        showAlert("error", "Файл «" + file.name + "» имеет неподдерживаемый формат. Разрешены: TXT, CSV.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showAlert("error", "Файл «" + file.name + "» превышает 10 МБ.");
        return;
      }

      var reader = new FileReader();
      reader.onload = function (e) {
        addDocument(file.name, file.size, e.target.result);
      };
      reader.onerror = function () {
        showAlert("error", "Не удалось прочитать файл «" + file.name + "».");
      };
      reader.readAsText(file);
    });
  }

  function addDocument(name, size, content) {
    if (uploadedFiles.length >= MAX_FILES) {
      showAlert("error", "Максимум " + MAX_FILES + " файлов одновременно.");
      return;
    }
    uploadedFiles.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      name: name,
      size: size,
      content: content
    });
    renderFileList();
  }

  function removeDocument(id) {
    uploadedFiles = uploadedFiles.filter(function (f) { return f.id !== id; });
    renderFileList();
  }

  function renderFileList() {
    fileCount.textContent = uploadedFiles.length + " / " + MAX_FILES;

    if (!uploadedFiles.length) {
      fileList.innerHTML = '<li class="file-list-empty">Пока нет загруженных файлов</li>';
      analyzeBtn.disabled = true;
      return;
    }

    analyzeBtn.disabled = false;
    fileList.innerHTML = "";
    uploadedFiles.forEach(function (f) {
      var li = document.createElement("li");
      li.className = "file-item";
      li.innerHTML =
        '<span class="file-item-icon">📄</span>' +
        '<span class="file-item-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + "</span>" +
        '<span class="file-item-size">' + formatSize(f.size) + "</span>" +
        '<button class="file-item-remove" aria-label="Удалить">✕</button>';
      li.querySelector(".file-item-remove").addEventListener("click", function () {
        removeDocument(f.id);
      });
      fileList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ PASTE TEXT ============
  var togglePasteBtn = document.getElementById("togglePasteBtn");
  var pasteBox = document.getElementById("pasteBox");
  var pasteTextarea = document.getElementById("pasteTextarea");
  var pasteFileName = document.getElementById("pasteFileName");
  var addPastedBtn = document.getElementById("addPastedBtn");

  togglePasteBtn.addEventListener("click", function () {
    pasteBox.classList.toggle("hidden");
  });

  addPastedBtn.addEventListener("click", function () {
    var text = pasteTextarea.value.trim();
    if (!text) {
      showAlert("error", "Вставьте текст документа перед добавлением.");
      return;
    }
    var name = pasteFileName.value.trim() || ("Документ " + (uploadedFiles.length + 1) + ".txt");
    if (!/\.(txt|csv)$/i.test(name)) name += ".txt";
    addDocument(name, new Blob([text]).size, text);
    pasteTextarea.value = "";
    pasteFileName.value = "";
    pasteBox.classList.add("hidden");
  });

  // ============ ALERTS ============
  function showAlert(type, message) {
    var container = document.getElementById("alertContainer");
    var icons = { error: "⚠️", success: "✅", info: "ℹ️", warning: "⚠️" };
    var div = document.createElement("div");
    div.className = "alert alert-" + type;
    div.innerHTML =
      '<span class="alert-icon">' + icons[type] + "</span>" +
      '<div class="alert-body"><p style="margin:0">' + escapeHtml(message) + "</p></div>";
    container.prepend(div);
    setTimeout(function () {
      div.style.transition = "opacity 0.4s";
      div.style.opacity = "0";
      setTimeout(function () { div.remove(); }, 400);
    }, 6000);
  }

  // ============ ANALYSIS ============
  var resultsBody = document.getElementById("resultsBody");
  var resultsActions = document.getElementById("resultsActions");

  function buildPrompt() {
    var docsText = uploadedFiles.map(function (f, i) {
      return "--- Документ " + (i + 1) + ": " + f.name + " ---\n" + f.content;
    }).join("\n\n");

    return (
      "Ты — экспертная система PayDoc Analyzer для анализа документов по оплате труда. " +
      "Проанализируй приложенные документы (табели учёта времени, служебные записки, согласия работников и др.) " +
      "и выполни следующие проверки:\n\n" +
      "1. СВОДНАЯ ТАБЛИЦА ПО СОТРУДНИКАМ — ФИО, базовые часы, выходные дни, аварийные часы, выезды, переработка, всего к оплате.\n" +
      "2. ПРОВЕРКА ПОЛНОТЫ ДОКУМЕНТОВ — какие типы документов присутствуют, каких не хватает.\n" +
      "3. ВЫЯВЛЕННЫЕ ПРОБЛЕМЫ — расхождения в часах, датах, отсутствие согласий, противоречия между документами.\n" +
      "4. РЕКОМЕНДАЦИИ — конкретные шаги по устранению найденных проблем.\n" +
      "5. ГОТОВНОСТЬ К РАСЧЁТУ — статус (ГОТОВО / ТРЕБУЕТСЯ УТОЧНЕНИЕ) и краткое обоснование.\n\n" +
      "Отвечай на русском языке, используй чёткую структуру с заголовками и, где уместно, таблицы в текстовом виде. " +
      "Будь конкретен: указывай ФИО, даты и цифры из документов.\n\n" +
      "ДОКУМЕНТЫ:\n\n" + docsText
    );
  }

  function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading || uploadedFiles.length === 0;
    analyzeBtn.textContent = isLoading ? "Анализ..." : "Начать анализ";
    if (isLoading) {
      resultsActions.classList.add("hidden");
      resultsBody.innerHTML =
        '<div class="loading-state"><div class="spinner"></div><p>Анализируем документы, это займёт до 30 секунд...</p></div>';
    }
  }

  analyzeBtn.addEventListener("click", function () {
    if (!uploadedFiles.length) return;

    var apiKey = getApiKey();
    if (!apiKey) {
      showAlert("error", "Сначала введите и сохраните ваш Anthropic API-ключ выше.");
      return;
    }

    setLoading(true);

    fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: buildPrompt() }]
      })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (result) {
        setLoading(false);
        if (!result.ok) {
          var msg = (result.data && result.data.error && result.data.error.message) || ("Ошибка API (код " + result.status + ")");
          if (result.status === 401) msg = "Неверный API-ключ. Проверьте ключ и попробуйте снова.";
          if (result.status === 429) msg = "Превышен лимит запросов к API. Попробуйте немного позже.";
          renderError(msg);
          return;
        }
        var text = (result.data.content || []).map(function (block) { return block.text || ""; }).join("\n");
        renderResults(text);
      })
      .catch(function (err) {
        setLoading(false);
        renderError("Сетевая ошибка: не удалось связаться с Claude API. Проверьте подключение к интернету. (" + err.message + ")");
      });
  });

  function renderResults(text) {
    lastResultText = text;
    resultsBody.innerHTML = '<div class="results-output"></div>';
    resultsBody.querySelector(".results-output").textContent = text;
    resultsActions.classList.remove("hidden");
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Начать анализ";
  }

  function renderError(message) {
    resultsBody.innerHTML =
      '<div class="results-placeholder"><div class="placeholder-icon">⚠️</div><p>' + escapeHtml(message) + "</p></div>";
    showAlert("error", message);
  }

  document.getElementById("copyResultsBtn").addEventListener("click", function () {
    if (!lastResultText) return;
    navigator.clipboard.writeText(lastResultText).then(function () {
      showAlert("success", "Результат скопирован в буфер обмена.");
    }).catch(function () {
      showAlert("error", "Не удалось скопировать результат.");
    });
  });

  document.getElementById("downloadResultsBtn").addEventListener("click", function () {
    if (!lastResultText) return;
    var date = new Date().toISOString().slice(0, 10);
    var blob = new Blob([lastResultText], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "paydoc-analysis-" + date + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ============ INIT ============
  renderFileList();
  navigate(currentPageFromHash());
})();
