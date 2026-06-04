/**
 * Main application entry point for Ukrainian Alphabet Date Dashboard.
 * Renders 33 cells in a grid, fetches ideas on load, and handles interactions.
 */
(function () {
  'use strict';

  // DOM references
  var loadingEl = document.getElementById('loading');
  var errorBannerEl = document.getElementById('error-banner');
  var errorMessageEl = document.getElementById('error-message');
  var retryBtn = document.getElementById('retry-btn');
  var gridEl = document.getElementById('grid');

  // Application state: array of { letter, ideas }
  var state = [];

  /**
   * Show loading state, hide grid and error
   */
  function showLoading() {
    loadingEl.classList.remove('hidden');
    errorBannerEl.classList.add('hidden');
    gridEl.classList.add('hidden');
  }

  /**
   * Show error banner with message and retry button
   */
  function showError(message) {
    loadingEl.classList.add('hidden');
    errorBannerEl.classList.remove('hidden');
    gridEl.classList.add('hidden');
    errorMessageEl.textContent =
      message || 'Could not load ideas. Please try again.';
  }

  /**
   * Show grid, hide loading and error
   */
  function showGrid() {
    loadingEl.classList.add('hidden');
    errorBannerEl.classList.add('hidden');
    gridEl.classList.remove('hidden');
  }

  /**
   * Fetch all ideas from the API and render the grid.
   */
  function loadDashboard() {
    showLoading();
    ApiClient.getAllIdeas()
      .then(function (data) {
        state = data;
        renderGrid(data);
        showGrid();
      })
      .catch(function (err) {
        showError(err.message || 'Could not load ideas. Please try again.');
      });
  }

  /**
   * Render the entire 33-cell grid.
   * @param {Array<{letter: string, ideas: Array}>} lettersWithIdeas
   */
  function renderGrid(lettersWithIdeas) {
    gridEl.innerHTML = '';
    lettersWithIdeas.forEach(function (letterData) {
      var cell = renderCell(letterData);
      gridEl.appendChild(cell);
    });
  }

  /**
   * Render a single letter cell.
   * @param {{letter: string, ideas: Array}} letterData
   * @returns {HTMLElement}
   */
  function renderCell(letterData) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('data-letter', letterData.letter);

    // Letter label
    var letterLabel = document.createElement('div');
    letterLabel.className = 'cell-letter';
    letterLabel.textContent = letterData.letter;
    cell.appendChild(letterLabel);

    // Idea list
    var ideaList = document.createElement('ul');
    ideaList.className = 'idea-list';

    // Sort ideas by createdAt ascending (oldest first)
    var sortedIdeas = (letterData.ideas || []).slice().sort(function (a, b) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    if (sortedIdeas.length === 0) {
      var emptyState = document.createElement('li');
      emptyState.className = 'cell-empty';
      emptyState.textContent = 'No ideas yet';
      ideaList.appendChild(emptyState);
    } else {
      sortedIdeas.forEach(function (idea) {
        var ideaItem = renderIdeaItem(idea, letterData.letter);
        ideaList.appendChild(ideaItem);
      });
    }

    cell.appendChild(ideaList);

    // Footer with Add button
    var footer = document.createElement('div');
    footer.className = 'cell-footer';

    var addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = '+ Add Idea';
    addBtn.setAttribute(
      'aria-label',
      'Add idea for letter ' + letterData.letter,
    );
    addBtn.addEventListener('click', function () {
      showAddForm(cell, letterData.letter);
    });

    footer.appendChild(addBtn);
    cell.appendChild(footer);

    return cell;
  }

  /**
   * Render a single idea list item.
   * @param {Object} idea - { id, letter, text, done, createdAt }
   * @param {string} letter
   * @returns {HTMLElement}
   */
  function renderIdeaItem(idea, letter) {
    var li = document.createElement('li');
    li.className = 'idea-item' + (idea.done ? ' completed' : '');
    li.setAttribute('data-id', idea.id);

    // Status icon
    var statusIcon = document.createElement('span');
    statusIcon.className = 'idea-status-icon';
    li.appendChild(statusIcon);

    // Idea text
    var textSpan = document.createElement('span');
    textSpan.className = 'idea-text';
    textSpan.textContent = idea.text;
    li.appendChild(textSpan);

    // Controls
    var controls = document.createElement('span');
    controls.className = 'idea-controls';

    // Mark as done button (only for incomplete ideas)
    if (!idea.done) {
      var doneBtn = document.createElement('button');
      doneBtn.className = 'btn-icon btn-done';
      doneBtn.textContent = '✓';
      doneBtn.title = 'Mark as done';
      doneBtn.setAttribute('aria-label', 'Mark idea as done');
      doneBtn.addEventListener('click', function () {
        markIdeaDone(idea.id, letter);
      });
      controls.appendChild(doneBtn);
    }

    // Remove button
    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn-icon btn-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove idea';
    removeBtn.setAttribute('aria-label', 'Remove idea');
    removeBtn.addEventListener('click', function () {
      confirmRemoveIdea(idea.id, letter);
    });
    controls.appendChild(removeBtn);

    li.appendChild(controls);

    return li;
  }

  /**
   * Show the add idea form in a cell, replacing the add button.
   */
  function showAddForm(cell, letter) {
    var footer = cell.querySelector('.cell-footer');
    footer.innerHTML = '';

    var form = document.createElement('div');
    form.className = 'add-form';

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter idea...';
    input.setAttribute('aria-label', 'New idea text for letter ' + letter);
    input.maxLength = 200;

    var validationMsg = document.createElement('div');
    validationMsg.className = 'validation-error hidden';

    var actions = document.createElement('div');
    actions.className = 'add-form-actions';

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Add';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Cancel';

    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);

    form.appendChild(input);
    form.appendChild(validationMsg);
    form.appendChild(actions);
    footer.appendChild(form);

    input.focus();

    // Submit handler
    submitBtn.addEventListener('click', function () {
      submitIdea(input, validationMsg, letter, cell);
    });

    // Enter key submits
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        submitIdea(input, validationMsg, letter, cell);
      }
    });

    // Cancel handler
    cancelBtn.addEventListener('click', function () {
      hideAddForm(cell, letter);
    });
  }

  /**
   * Hide the add form and restore the Add button.
   */
  function hideAddForm(cell, letter) {
    var footer = cell.querySelector('.cell-footer');
    footer.innerHTML = '';

    var addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = '+ Add Idea';
    addBtn.setAttribute('aria-label', 'Add idea for letter ' + letter);
    addBtn.addEventListener('click', function () {
      showAddForm(cell, letter);
    });
    footer.appendChild(addBtn);
  }

  /**
   * Validate and submit a new idea.
   */
  function submitIdea(input, validationMsg, letter, cell) {
    var text = input.value;

    // Client-side validation
    if (!text || !text.trim()) {
      validationMsg.textContent = 'Idea text cannot be empty.';
      validationMsg.classList.remove('hidden');
      return;
    }
    if (text.length > 200) {
      validationMsg.textContent = 'Idea text must not exceed 200 characters.';
      validationMsg.classList.remove('hidden');
      return;
    }

    validationMsg.classList.add('hidden');

    ApiClient.createIdea(letter, text.trim())
      .then(function (newIdea) {
        // Update local state
        var letterState = findLetterState(letter);
        if (letterState) {
          letterState.ideas.push(newIdea);
        }
        // Re-render the cell's idea list
        refreshCellIdeas(cell, letter);
        hideAddForm(cell, letter);
      })
      .catch(function (err) {
        validationMsg.textContent =
          err.message || 'Could not save idea. Please try again.';
        validationMsg.classList.remove('hidden');
        // Preserve entered text in input field
      });
  }

  /**
   * Confirm and remove an idea.
   */
  function confirmRemoveIdea(id, letter) {
    var confirmed = confirm('Are you sure you want to remove this idea?');
    if (!confirmed) return;

    ApiClient.deleteIdea(id)
      .then(function () {
        // Update local state
        var letterState = findLetterState(letter);
        if (letterState) {
          letterState.ideas = letterState.ideas.filter(function (idea) {
            return idea.id !== id;
          });
        }
        // Re-render the cell
        var cell = gridEl.querySelector('[data-letter="' + letter + '"]');
        if (cell) {
          refreshCellIdeas(cell, letter);
        }
      })
      .catch(function (err) {
        alert(err.message || 'Could not remove idea. Please try again.');
      });
  }

  /**
   * Mark an idea as done.
   */
  function markIdeaDone(id, letter) {
    ApiClient.updateIdeaStatus(id, true)
      .then(function (updatedIdea) {
        // Update local state
        var letterState = findLetterState(letter);
        if (letterState) {
          letterState.ideas = letterState.ideas.map(function (idea) {
            if (idea.id === id) {
              return updatedIdea;
            }
            return idea;
          });
        }
        // Re-render the cell
        var cell = gridEl.querySelector('[data-letter="' + letter + '"]');
        if (cell) {
          refreshCellIdeas(cell, letter);
        }
      })
      .catch(function (err) {
        alert(err.message || 'Could not mark idea as done. Please try again.');
      });
  }

  /**
   * Find the letter entry in the application state.
   */
  function findLetterState(letter) {
    for (var i = 0; i < state.length; i++) {
      if (state[i].letter === letter) {
        return state[i];
      }
    }
    return null;
  }

  /**
   * Refresh just the idea list within a cell (preserving the footer/form state).
   */
  function refreshCellIdeas(cell, letter) {
    var ideaList = cell.querySelector('.idea-list');
    ideaList.innerHTML = '';

    var letterState = findLetterState(letter);
    var ideas = letterState ? letterState.ideas : [];

    // Sort ideas by createdAt ascending
    var sortedIdeas = ideas.slice().sort(function (a, b) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    if (sortedIdeas.length === 0) {
      var emptyState = document.createElement('li');
      emptyState.className = 'cell-empty';
      emptyState.textContent = 'No ideas yet';
      ideaList.appendChild(emptyState);
    } else {
      sortedIdeas.forEach(function (idea) {
        var ideaItem = renderIdeaItem(idea, letter);
        ideaList.appendChild(ideaItem);
      });
    }
  }

  // Retry button handler
  retryBtn.addEventListener('click', function () {
    loadDashboard();
  });

  // Initial load
  loadDashboard();
})();
