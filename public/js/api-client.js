/**
 * API Client for Ukrainian Alphabet Date Dashboard
 * Provides functions for communicating with the backend REST API.
 * Functions are exposed globally (no ES modules).
 */
var ApiClient = (function () {
  'use strict';

  var BASE_URL = '/api/ideas';

  /**
   * Parse JSON response body and throw on non-ok status.
   */
  function handleResponse(response) {
    return response.json().then(function (data) {
      if (!response.ok) {
        var error = new Error(data.message || 'Request failed');
        error.status = response.status;
        error.body = data;
        throw error;
      }
      return data;
    });
  }

  /**
   * GET /api/ideas - Retrieve all letters with their ideas
   * @returns {Promise<Array<{letter: string, ideas: Array}>>}
   */
  function getAllIdeas() {
    return fetch(BASE_URL).then(handleResponse);
  }

  /**
   * POST /api/ideas/:letter - Create a new idea for a letter
   * @param {string} letter - Ukrainian alphabet letter
   * @param {string} text - Idea text (1-200 chars)
   * @returns {Promise<Object>} Created idea
   */
  function createIdea(letter, text) {
    return fetch(BASE_URL + '/' + encodeURIComponent(letter), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text }),
    }).then(handleResponse);
  }

  /**
   * DELETE /api/ideas/:id - Delete an idea by ID
   * @param {string} id - Idea UUID
   * @returns {Promise<{deleted: boolean}>}
   */
  function deleteIdea(id) {
    return fetch(BASE_URL + '/' + encodeURIComponent(id), {
      method: 'DELETE',
    }).then(handleResponse);
  }

  /**
   * PATCH /api/ideas/:id/status - Update idea completion status
   * @param {string} id - Idea UUID
   * @param {boolean} done - New completion status
   * @returns {Promise<Object>} Updated idea
   */
  function updateIdeaStatus(id, done) {
    return fetch(BASE_URL + '/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: done }),
    }).then(handleResponse);
  }

  return {
    getAllIdeas: getAllIdeas,
    createIdea: createIdea,
    deleteIdea: deleteIdea,
    updateIdeaStatus: updateIdeaStatus,
  };
})();
