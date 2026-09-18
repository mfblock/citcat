var CitCatDataPanel = (function () {
  var invoke = window.__TAURI__.core.invoke;
  var isOpen = false;
  var connected = false;
  var columns = [];
  var currentTable = "";
  var totalRows = 0;
  var currentPage = 0;
  var PAGE_SIZE = 20;
  var previewRow = 0;

  function init() {
    document.getElementById("data-connect-btn").addEventListener("click", doConnect);
    document.getElementById("data-disconnect-btn").addEventListener("click", doDisconnect);
    document.getElementById("data-close-btn").addEventListener("click", close);
    document.getElementById("data-table-select").addEventListener("change", onTableChange);
    document.getElementById("data-prev-page").addEventListener("click", function () {
      if (currentPage > 0) { currentPage--; loadRows(); }
    });
    document.getElementById("data-next-page").addEventListener("click", function () {
      if ((currentPage + 1) * PAGE_SIZE < totalRows) { currentPage++; loadRows(); }
    });
    document.getElementById("data-preview-prev").addEventListener("click", function () {
      if (previewRow > 0) { setPreviewRow(previewRow - 1); }
    });
    document.getElementById("data-preview-next").addEventListener("click", function () {
      if (previewRow < totalRows - 1) { setPreviewRow(previewRow + 1); }
    });
    document.getElementById("data-file-browse").addEventListener("click", browseFile);
  }

  function open() {
    isOpen = true;
    document.getElementById("data-modal").hidden = false;
    updateUI();
  }

  function close() {
    isOpen = false;
    document.getElementById("data-modal").hidden = true;
  }

  function browseFile() {
    var sourceType = document.getElementById("data-source-type").value;
    var filter = sourceType === "Sqlite" ? ["db", "sqlite", "sqlite3"] : ["csv", "tsv"];
    var label = sourceType === "Sqlite" ? "Database" : "CSV";
    invoke("dialog_open_file").then(function (path) {
      if (path) document.getElementById("data-connection").value = path;
    });
  }

  function doConnect() {
    var sourceType = document.getElementById("data-source-type").value;
    var connection = document.getElementById("data-connection").value.trim();
    if (!connection) return;

    var statusEl = document.getElementById("data-status");
    statusEl.textContent = "Connecting...";
    statusEl.hidden = false;

    invoke("data_connect", { sourceType: sourceType, connection: connection })
      .then(function (result) {
        connected = true;
        statusEl.textContent = "Connected";
        var select = document.getElementById("data-table-select");
        select.innerHTML = "";
        for (var i = 0; i < result.tables.length; i++) {
          var opt = document.createElement("option");
          opt.value = result.tables[i];
          opt.textContent = result.tables[i];
          select.appendChild(opt);
        }
        if (result.tables.length > 0) {
          currentTable = result.tables[0];
          onTableChange();
        }
        updateUI();
        setTimeout(function () { statusEl.hidden = true; }, 2000);
      })
      .catch(function (err) {
        statusEl.textContent = "Error: " + err;
      });
  }

  function doDisconnect() {
    invoke("data_disconnect").then(function () {
      connected = false;
      columns = [];
      currentTable = "";
      totalRows = 0;
      previewRow = 0;
      updateUI();
      CitCatApp.requestRender();
    });
  }

  function onTableChange() {
    var select = document.getElementById("data-table-select");
    currentTable = select.value;
    if (!currentTable) return;
    invoke("data_select_table", { table: currentTable });
    currentPage = 0;
    loadColumns();
    loadRows();
  }

  function loadColumns() {
    invoke("data_columns", { table: currentTable }).then(function (cols) {
      columns = cols;
      var header = document.getElementById("data-columns-header");
      header.innerHTML = "";
      for (var i = 0; i < cols.length; i++) {
        var th = document.createElement("th");
        th.textContent = cols[i].name;
        th.title = cols[i].data_type;
        header.appendChild(th);
      }
    });
  }

  function loadRows() {
    invoke("data_rows", { table: currentTable, offset: currentPage * PAGE_SIZE, limit: PAGE_SIZE })
      .then(function (result) {
        totalRows = result.total;
        var body = document.getElementById("data-rows-body");
        body.innerHTML = "";
        for (var i = 0; i < result.rows.length; i++) {
          var tr = document.createElement("tr");
          for (var j = 0; j < columns.length; j++) {
            var td = document.createElement("td");
            var val = result.rows[i][columns[j].name];
            td.textContent = val === null || val === undefined ? "" : String(val);
            tr.appendChild(td);
          }
          body.appendChild(tr);
        }
        updatePageInfo();
      });
  }

  function updatePageInfo() {
    var info = document.getElementById("data-page-info");
    var start = currentPage * PAGE_SIZE + 1;
    var end = Math.min((currentPage + 1) * PAGE_SIZE, totalRows);
    info.textContent = start + "–" + end + " of " + totalRows;
  }

  function setPreviewRow(row) {
    previewRow = row;
    invoke("data_set_preview_row", { row: row }).then(function (rowData) {
      document.getElementById("data-preview-label").textContent =
        "Row " + (row + 1) + " of " + totalRows;
      CitCatApp.setPreviewRowData(rowData);
    });
  }

  function updateUI() {
    document.getElementById("data-connect-section").hidden = connected;
    document.getElementById("data-browse-section").hidden = !connected;
    document.getElementById("data-disconnect-btn").hidden = !connected;
    document.getElementById("data-preview-controls").hidden = !connected;
  }

  function isConnected() { return connected; }
  function getColumns() { return columns; }

  return {
    init: init,
    open: open,
    close: close,
    isConnected: isConnected,
    getColumns: getColumns,
  };
})();
