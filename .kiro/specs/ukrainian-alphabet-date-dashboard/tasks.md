# Implementation Plan: Ukrainian Alphabet Date Dashboard

## Overview

This plan implements a full-stack web application with a NestJS backend and responsive frontend for managing date ideas organized by the 33 Ukrainian alphabet letters. The implementation follows a bottom-up approach: shared constants and data models first, then persistence, service, controller layers, and finally the frontend.

## Tasks

- [x] 1. Set up project structure and shared constants
  - [x] 1.1 Initialize NestJS project and install dependencies
    - Initialize NestJS project if not already set up
    - Install required dependencies: `class-validator`, `class-transformer`, `uuid`
    - Install dev dependencies: `fast-check`, `@nestjs/testing`
    - Configure `ValidationPipe` globally in `main.ts`
    - _Requirements: 6.1, 6.5, 6.7_

  - [x] 1.2 Create shared data models, DTOs, and Ukrainian alphabet constant
    - Create `src/ideas/constants/ukrainian-alphabet.constant.ts` with the 33-letter array
    - Create `src/ideas/interfaces/idea.interface.ts` with `Idea`, `LetterWithIdeas`, and `StoredData` interfaces
    - Create `src/ideas/dto/create-idea.dto.ts` with `@IsNotEmpty()` and `@MaxLength(200)` on `text`
    - Create `src/ideas/dto/update-idea-status.dto.ts` with `@IsBoolean()` on `done`
    - _Requirements: 6.2, 6.4, 6.5, 6.7, 7.3_

- [x] 2. Implement persistence layer
  - [x] 2.1 Implement PersistenceService for file-based JSON storage
    - Create `src/ideas/persistence/persistence.service.ts`
    - Implement `readData(): Promise<StoredData>` that reads from `data/ideas.json`
    - Implement `writeData(data: StoredData): Promise<void>` that writes to `data/ideas.json`
    - Handle file-not-found gracefully by returning empty `{ ideas: [] }`
    - Wrap file system errors in `InternalServerErrorException`
    - Ensure `data/` directory is created if it doesn't exist
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 2.2 Write property test for persistence round-trip (Property 7)
    - **Property 7: Persistence round-trip**
    - Generate random sets of ideas with valid fields, write via PersistenceService, read back, verify identical data
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 7.1, 7.2**

- [x] 3. Implement ideas service layer
  - [x] 3.1 Implement IdeasService with CRUD operations
    - Create `src/ideas/ideas.service.ts`
    - Implement `getAllLettersWithIdeas()`: read all ideas, group by letter, ensure all 33 letters are present, sort ideas by `createdAt` ascending
    - Implement `createIdea(letter, text)`: validate letter against constant, trim text, generate UUID, set `done: false`, set ISO 8601 `createdAt`, persist
    - Implement `deleteIdea(id)`: find idea by ID, throw `NotFoundException` if not found, remove from store, persist
    - Implement `updateIdeaStatus(id, done)`: find idea by ID, throw `NotFoundException` if not found, update `done` field, persist, return updated idea
    - Throw `BadRequestException` for invalid letters with descriptive message
    - _Requirements: 1.4, 2.3, 3.3, 4.3, 5.2, 6.1, 6.2, 6.4, 6.5, 6.6, 6.8_

  - [x] 3.2 Write property test: API returns exactly 33 letters sorted by creation time (Property 1)
    - **Property 1: API always returns exactly 33 letters with ideas sorted by creation time**
    - Generate random sets of ideas across random valid letters
    - Call `getAllLettersWithIdeas()`, verify exactly 33 entries, each letter's ideas sorted by `createdAt`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.4, 3.3, 6.1**

  - [x] 3.3 Write property test: idea creation round-trip preserves data (Property 2)
    - **Property 2: Idea creation round-trip preserves data**
    - Generate random valid letters and random valid text strings (1-200 chars, not whitespace-only)
    - Create idea, retrieve via `getAllLettersWithIdeas()`, verify all fields preserved
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 2.3, 6.2, 7.3**

  - [x] 3.4 Write property test: invalid text is rejected (Property 3)
    - **Property 3: Invalid text is rejected**
    - Generate random invalid strings (empty, whitespace-only, >200 chars)
    - Attempt `createIdea()`, verify exception thrown and stored ideas unchanged
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 2.5, 2.6, 6.7**

  - [x] 3.5 Write property test: invalid letter is rejected (Property 4)
    - **Property 4: Invalid letter is rejected**
    - Generate random strings that are not one of the 33 Ukrainian alphabet letters
    - Attempt `createIdea()`, verify `BadRequestException` and no state change
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 6.5**

  - [x] 3.6 Write property test: delete removes idea from store (Property 5)
    - **Property 5: Delete removes idea from store**
    - Generate random ideas, create them, pick one, delete it
    - Verify it no longer appears in subsequent retrieval
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 4.3, 6.8**

  - [x] 3.7 Write property test: status update sets completion state (Property 6)
    - **Property 6: Status update sets completion state**
    - Generate random ideas and random boolean values
    - Update status, verify response `done` field matches, and subsequent retrieval matches
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 5.2, 6.4**

- [x] 4. Checkpoint - Backend service and persistence tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ideas controller layer
  - [x] 5.1 Implement IdeasController with all REST endpoints
    - Create `src/ideas/ideas.controller.ts`
    - Implement `GET /api/ideas` → calls `ideasService.getAllLettersWithIdeas()`
    - Implement `POST /api/ideas/:letter` → validates DTO, calls `ideasService.createIdea(letter, dto.text)`
    - Implement `DELETE /api/ideas/:id` → calls `ideasService.deleteIdea(id)`, returns `{ deleted: true }`
    - Implement `PATCH /api/ideas/:id/status` → validates DTO, calls `ideasService.updateIdeaStatus(id, dto.done)`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 5.2 Create IdeasModule and wire dependencies
    - Create `src/ideas/ideas.module.ts` exporting `IdeasController`, providing `IdeasService` and `PersistenceService`
    - Import `IdeasModule` in `AppModule`
    - _Requirements: 6.1_

  - [x] 5.3 Write unit tests for IdeasController
    - Test each endpoint returns correct status codes and response shapes
    - Test validation pipe rejects invalid DTOs (empty text, missing `done` field)
    - Test 404 response when idea not found
    - Test 400 response for invalid letter
    - _Requirements: 6.2, 6.5, 6.6, 6.7_

- [x] 6. Implement frontend - grid layout and data loading
  - [x] 6.1 Create HTML structure and responsive CSS Grid layout
    - Create `public/index.html` with dashboard container
    - Create `public/styles.css` with CSS Grid: minimum 4 columns at 768px, minimum 6 columns at 1024px
    - Style cells with visible borders, uniform size, letter label prominently displayed
    - Ensure no horizontal scrolling — all 33 cells visible
    - Add styles for completed ideas (strikethrough or visual indicator)
    - Add styles for error states, loading states
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 5.4_

  - [x] 6.2 Implement API client module
    - Create `public/js/api-client.js` with fetch wrapper
    - Implement `getAllIdeas()` → `GET /api/ideas`
    - Implement `createIdea(letter, text)` → `POST /api/ideas/:letter`
    - Implement `deleteIdea(id)` → `DELETE /api/ideas/:id`
    - Implement `updateIdeaStatus(id, done)` → `PATCH /api/ideas/:id/status`
    - Handle JSON parsing and error response extraction
    - _Requirements: 1.4, 2.3, 4.3, 5.2_

  - [x] 6.3 Implement DashboardGrid and LetterCell rendering
    - Create `public/js/app.js` as main application entry point
    - Fetch all ideas on load and render 33 cells
    - Each cell displays: letter label, idea list (text + completion status), add button
    - Display completed ideas with visual "completed" indicator
    - Display ideas in order (oldest first based on `createdAt`)
    - Show error message with retry button if initial load fails
    - _Requirements: 1.1, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Implement frontend - idea interactions
  - [x] 7.1 Implement add idea flow
    - Show input field and cancel button when "Add Idea" is clicked
    - Client-side validation: reject empty/whitespace-only text, reject text > 200 chars with error message
    - On successful submit: call API, add idea to cell's list without page reload
    - On API error: show error message, preserve entered text in input field
    - On cancel: hide input field without adding idea
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 7.2 Implement remove idea flow
    - Display "Remove" control for each idea regardless of completion status
    - Show confirmation prompt before deletion
    - On confirm: call API, remove idea from list without page reload
    - On API error: show error message, retain idea in list
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 7.3 Implement mark as done flow
    - Display "Mark as Done" control only for incomplete ideas
    - On click: call API, update visual indicator without page reload
    - On API error: show error message, leave idea in current state
    - Hide "Mark as Done" control for already-completed ideas
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Serve frontend from NestJS and final wiring
  - [x] 8.1 Configure NestJS to serve static frontend files
    - Install `@nestjs/serve-static` package
    - Configure `ServeStaticModule` in `AppModule` to serve from `public/` directory
    - Ensure API routes take precedence over static file serving
    - _Requirements: 1.1, 1.4_

  - [x] 8.2 Write integration tests for full API workflow
    - Test full CRUD cycle: create idea → read → update status → delete
    - Test all 33 letters returned on GET even when no ideas exist
    - Test error responses for invalid inputs
    - Test persistence durability (create, re-instantiate service, verify data)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The frontend uses vanilla HTML/CSS/JS served statically by NestJS (no frontend framework)
- All property tests use `fast-check` with minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["6.3", "8.1"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 9, "tasks": ["8.2"] }
  ]
}
```
