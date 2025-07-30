---
inclusion: always
---

# GrienPR Documentation Rule

## Task Completion Documentation

Whenever a task is completed during the LLM embedding feature development, automatically update the GrienPR/README.md file with:

1. **Completed Task Details**: Add the completed task to the "Key Features Implemented" section
2. **Files Modified**: Update the "New Files Created" and "Modified Files" sections
3. **Dependencies Added**: Update the "Dependencies Added" section if new packages were installed
4. **Implementation Notes**: Add any relevant technical details or decisions made
5. **Timestamp**: Include when the task was completed

## Documentation Format

Use this format when updating the GrienPR documentation:

```markdown
### [Date] - Task Completed: [Task Name]
- **Files Modified**: List of files changed
- **Dependencies Added**: Any new packages
- **Implementation Details**: Key technical decisions
- **Status**: ✅ Complete / ⚠️ Partial / ❌ Failed
```

## Automation Trigger

This documentation should be updated:
- After completing any task from the tasks.md file
- When adding new dependencies to package.json
- When creating or modifying significant files
- When reaching major milestones in the implementation