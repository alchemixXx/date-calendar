# Requirements Document

## Introduction

The Ukrainian Alphabet Date Dashboard is a web application for planning creative dates with a partner. The dashboard displays all 33 letters of the Ukrainian alphabet in a grid layout (inspired by Google Calendar's grid style). Each letter represents a category for date ideas — users brainstorm and track date ideas that start with each letter. Each cell supports adding ideas, viewing a list of ideas, removing ideas, and marking ideas as completed. The backend is built with NestJS.

## Glossary

- **Dashboard**: The main page displaying all 33 Ukrainian alphabet letters in a grid layout
- **Cell**: A single grid element representing one Ukrainian alphabet letter, containing the letter label and its associated ideas
- **Idea**: A date suggestion associated with a specific letter of the Ukrainian alphabet
- **Grid**: A responsive layout of cells arranged in rows and columns, similar to Google Calendar's visual structure
- **API**: The NestJS backend service that handles all data operations for ideas
- **Idea_List**: The collection of ideas displayed within a single cell

## Requirements

### Requirement 1: Display Ukrainian Alphabet Grid

**User Story:** As a user, I want to see all 33 Ukrainian alphabet letters displayed in a grid layout, so that I can quickly browse and manage date ideas by letter.

#### Acceptance Criteria

1. THE Dashboard SHALL display all 33 letters of the Ukrainian alphabet (А, Б, В, Г, Ґ, Д, Е, Є, Ж, З, И, І, Ї, Й, К, Л, М, Н, О, П, Р, С, Т, У, Ф, Х, Ц, Ч, Ш, Щ, Ь, Ю, Я) in a Grid layout where each Cell displays its letter label and all Cells are uniform in size
2. THE Grid SHALL arrange Cells in rows and columns with visible borders separating each Cell, with at least 4 columns on viewports 768px and wider, and at least 6 columns on viewports 1024px and wider
3. THE Dashboard SHALL render on viewports 768px wide and above, adjusting the number of Grid columns to the available width while keeping all 33 Cells visible without horizontal scrolling
4. WHEN the Dashboard loads, THE API SHALL return all 33 cells with their associated ideas
5. IF the API request fails during Dashboard load, THEN THE Dashboard SHALL display an error message indicating that ideas could not be loaded and provide a retry option

### Requirement 2: Add a Date Idea

**User Story:** As a user, I want to add a date idea to a specific letter, so that I can brainstorm creative dates starting with that letter.

#### Acceptance Criteria

1. THE Cell SHALL display an "Add Idea" button for each letter
2. WHEN the user clicks the "Add Idea" button, THE Dashboard SHALL display an input field for entering the idea text and a control to cancel the action
3. WHEN the user submits a new idea, THE API SHALL store the idea associated with the corresponding letter and return the stored idea with its identifier
4. WHEN the user submits a new idea successfully, THE Dashboard SHALL display the new idea in the Idea_List of that Cell without a full page reload
5. IF the user submits idea text that is empty or contains only whitespace characters, THEN THE Dashboard SHALL display a validation error message and reject the submission without calling the API
6. IF the user submits idea text that exceeds 200 characters, THEN THE Dashboard SHALL display a validation error message indicating the maximum length and reject the submission without calling the API
7. IF the API returns an error when storing the idea, THEN THE Dashboard SHALL display an error message indicating the idea was not saved and SHALL preserve the entered text in the input field
8. WHEN the user activates the cancel control, THE Dashboard SHALL hide the input field without adding an idea

### Requirement 3: Display List of Ideas

**User Story:** As a user, I want to see all ideas listed within each letter's cell, so that I can review what date options I have brainstormed.

#### Acceptance Criteria

1. THE Cell SHALL display the Idea_List containing all ideas associated with that letter, showing each idea's text and completion status
2. WHEN an idea is marked as done, THE Dashboard SHALL display that idea with a visual "completed" indicator that is distinct from incomplete ideas
3. THE Idea_List SHALL display ideas in the order they were added (oldest first), based on creation timestamp
4. IF there are no ideas for a letter, THEN THE Cell SHALL display an empty state (no list items)
5. IF the API fails to return ideas for a letter, THEN THE Dashboard SHALL display an error indication within that Cell

### Requirement 4: Remove a Date Idea

**User Story:** As a user, I want to remove a date idea from a letter, so that I can discard ideas that are no longer relevant.

#### Acceptance Criteria

1. THE Cell SHALL display a "Remove" control for each idea in the Idea_List regardless of completion status
2. WHEN the user clicks the "Remove" control, THE Dashboard SHALL display a confirmation prompt before proceeding with deletion
3. WHEN the user confirms the removal, THE API SHALL delete the idea from the data store
4. WHEN the user removes an idea, THE Dashboard SHALL remove that idea from the Idea_List without a full page reload
5. IF the idea to be removed does not exist, THEN THE API SHALL return a "not found" error response
6. IF the API fails to delete the idea, THEN THE Dashboard SHALL display an error message indicating the idea could not be removed and SHALL retain the idea in the Idea_List

### Requirement 5: Mark an Idea as Done

**User Story:** As a user, I want to mark a date idea as done, so that I can track which dates my wife and I have already completed.

#### Acceptance Criteria

1. THE Cell SHALL display a "Mark as Done" control for each incomplete idea in the Idea_List
2. WHEN the user clicks "Mark as Done", THE API SHALL update the idea status to completed and return the updated idea
3. WHEN the user marks an idea as done, THE Dashboard SHALL display the completed indicator on that idea without a full page reload
4. THE Cell SHALL visually distinguish completed ideas from incomplete ideas using a distinct style applied to the idea text
5. IF the idea is already marked as done, THEN THE Dashboard SHALL not display the "Mark as Done" control for that idea
6. IF the API returns an error when the user attempts to mark an idea as done, THEN THE Dashboard SHALL display an error message indicating the operation failed and SHALL leave the idea in its current incomplete state

### Requirement 6: Backend API for Idea Management

**User Story:** As a developer, I want a RESTful NestJS API to manage ideas, so that the frontend can reliably persist and retrieve data.

#### Acceptance Criteria

1. THE API SHALL expose an endpoint to retrieve all 33 letters with their associated ideas, returning each letter with its list of ideas ordered by creation timestamp ascending
2. WHEN the API successfully creates a new idea, THE API SHALL return the created idea resource including its assigned identifier, associated letter, idea text, completion status, and creation timestamp
3. THE API SHALL expose an endpoint to delete an idea by its identifier
4. THE API SHALL expose an endpoint to update an idea's completion status by accepting an explicit completion state (true or false)
5. WHEN a request contains an invalid letter (not one of the 33 Ukrainian alphabet letters), THE API SHALL return a 400 Bad Request response with an error message indicating the letter is invalid
6. WHEN a request references a non-existent idea identifier, THE API SHALL return a 404 Not Found response with an error message indicating the idea was not found
7. IF idea text validation fails (empty string, whitespace-only, or exceeds 200 characters), THEN THE API SHALL return a 400 Bad Request response with an error message indicating the validation failure reason
8. WHEN the API successfully deletes an idea, THE API SHALL return a success response confirming the deletion and the idea SHALL no longer appear in subsequent retrieval requests

### Requirement 7: Data Persistence

**User Story:** As a user, I want my ideas to be saved permanently, so that I do not lose my date plans between sessions.

#### Acceptance Criteria

1. THE API SHALL persist all ideas to a durable data store so they survive server restarts
2. WHEN the Dashboard is loaded on a subsequent visit, THE API SHALL return all previously saved ideas with their associated letter, idea text, current completion status, and creation timestamp
3. THE API SHALL store each idea with a unique identifier, the associated letter, the idea text, the completion status, and a creation timestamp in ISO 8601 format
4. IF the data store is unavailable when the API attempts to read or write an idea, THEN THE API SHALL return an error response indicating a storage failure
