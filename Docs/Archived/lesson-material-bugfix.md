# Lesson Material Management - Critical Bug Fixes

**Date:** 2025-12-09  
**Component:** `/app/admin/courses/[id]/edit/page.tsx`  
**Issue Type:** Data Loss & State Management

---

## 🚨 Critical Issues Fixed

### **Issue 1: Attached Materials Disappear After Save** (Severity: HIGH)
**Symptom:** After saving a lesson with attached materials, the materials list appears empty until user interaction.

**Root Cause:**  
Data format inconsistency between optimistic updates and API responses:
- Optimistic update used **normalized format**: `{ id, title, type, url }`
- `reloadCourse()` set **raw API format**: `{ courseAsset: { id, title, ... }, ... }`
- UI rendering expected normalized format
- Result: Materials invisible until data was re-normalized by user interaction

**Fix Applied:**  
Modified `reloadCourse()` to normalize all lesson assets consistently:
```typescript
// Before
setCourse(response.data as any)

// After
const rawCourse = response.data as any
if (rawCourse.chapters) {
    rawCourse.chapters = rawCourse.chapters.map(chapter => ({
        ...chapter,
        lessons: chapter.lessons.map(lesson => ({
            ...lesson,
            assets: lesson.assets.map(a => {
                const asset = a.courseAsset ? a.courseAsset : a
                return {
                    id: asset.id,
                    title: asset.title,
                    type: asset.type,
                    url: asset.cloudfrontUrl ?? asset.url,
                    // ... other normalized fields
                }
            })
        }))
    }))
}
setCourse(rawCourse)
```

---

### **Issue 2: Editing Lesson Silently Deletes All Attachments** (Severity: CRITICAL)
**Symptom:**  
1. Lesson has attachments (e.g., 3 PDF files)
2. Admin clicks "Edit Lesson"
3. Admin changes lesson title, clicks "Save"
4. **All 3 attachments are deleted without warning**

**Root Cause:**  
Incorrect asset ID extraction in `hydrateLessonForm()`:

```typescript
// BROKEN CODE
const bindingIds = (lesson.assets || [])
    .map((a: any) => (a.courseAsset ? a.courseAsset.id : a.courseAssetId))
    .filter(Boolean) || []
// Result: bindingIds = [] (always empty after normalization!)
```

**Why it failed:**
- After normalization, assets have structure: `{ id, title, type, url }`
- Code tried to access `a.courseAsset.id` → **undefined** (nested object doesn't exist)
- Code tried to access `a.courseAssetId` → **undefined** (property doesn't exist)
- Result: Empty array `[]` was sent to backend as `courseAssetIds: []`
- Backend interpreted this as "detach all assets"

**Fix Applied:**  
Robust asset ID extraction supporting multiple data formats:
```typescript
const bindingIds = (lesson.assets || [])
    .map((a: any) => {
        // Try nested courseAsset first (raw API format)
        if (a.courseAsset?.id) return a.courseAsset.id
        // Try direct courseAssetId property (join table format)
        if (a.courseAssetId) return a.courseAssetId
        // Fallback to direct id (normalized format)
        return a.id
    })
    .filter(Boolean)

setSelectedLessonAssetIds(bindingIds)  // ← Now correctly populated!
```

---

## ✅ Correct State Management Model

### **Single Source of Truth**
```typescript
// The ONLY state that matters for asset selection
const [selectedLessonAssetIds, setSelectedLessonAssetIds] = useState<string[]>([])
```

### **State Lifecycle**

| Event | Action | `selectedLessonAssetIds` Value |
|-------|--------|-------------------------------|
| **Open Edit (existing lesson)** | `hydrateLessonForm(lesson)` | `["asset-uuid-1", "asset-uuid-2"]` |
| **Open Create (new lesson)** | `openLessonModal(chapterId)` | `[]` |
| **User checks asset** | `handleToggleAsset(id)` | Add `id` to array |
| **User unchecks asset** | `handleToggleAsset(id)` | Remove `id` from array |
| **Save lesson** | `handleSaveLesson()` | Send as `courseAssetIds` to backend |

### **Data Preservation Guarantee**

```typescript
// Backend interprets courseAssetIds as COMPLETE replacement set

Initial state:     lesson has [A, B, C]
User edits:        changes title only, doesn't touch checkboxes
selectedAssetIds:  [A, B, C]  ← Preserved from hydration
Save payload:      { title: "New Title", courseAssetIds: [A, B, C] }
Final state:       lesson has [A, B, C]  ✅ No data loss
```

---

## 🎯 UI Behavior Contracts

### **Contract 1: No User Action = No Data Loss**
- Opening edit mode MUST pre-select all existing attachments
- Saving without interaction MUST preserve all existing data
- Deletion happens ONLY when user explicitly unchecks an asset

### **Contract 2: Immediate Visibility**
- Attached materials MUST render immediately after save
- No clicking or interaction required to trigger display
- Materials list updates in real-time as assets are attached/detached

### **Contract 3: Explicit User Intent**
- Checking asset → Attach on save
- Unchecking asset → Detach on save
- No implicit actions or surprises

---

## 🧪 Testing Checklist

### **Test Case 1: Edit Preserves Attachments**
1. Create lesson with 3 attached PDFs
2. Click "Edit Lesson"
3. Verify: All 3 PDFs are checked in asset list
4. Change lesson title
5. Click "Save"
6. **Expected:** All 3 PDFs still attached
7. **Verify:** Badge shows "3 files", materials list displays all 3

### **Test Case 2: Explicit Detachment**
1. Edit lesson with 3 attachments
2. Uncheck 1 asset
3. Click "Save"
4. **Expected:** Only that 1 asset is detached
5. **Verify:** Badge shows "2 files"

### **Test Case 3: Immediate Visibility**
1. Create new lesson
2. Attach 2 materials
3. Click "Save"
4. **Expected:** Materials appear immediately in lesson list
5. **Verify:** No need to click or refresh

### **Test Case 4: Mixed Operations**
1. Edit lesson with existing attachments [A, B]
2. Uncheck A
3. Check C (new attachment)
4. Click "Save"
5. **Expected:** Final state is [B, C]

---

## 🛡️ Robustness Against Future Changes

### **Data Format Flexibility**
The asset ID extraction now handles:
- Raw API format: `{ courseAsset: { id: "..." }, ... }`
- Join table format: `{ courseAssetId: "...", ... }`
- Normalized format: `{ id: "...", title: "..." }`

This prevents breakage if backend changes response structure.

### **Normalization Pipeline**
All data entering the UI state is normalized through `reloadCourse()`, ensuring:
- Consistent data shape throughout component
- Predictable rendering behavior
- No special cases in UI code

---

## 📊 Before vs After Comparison

| Scenario | Before | After |
|----------|--------|-------|
| Edit lesson, change title only | ❌ All attachments deleted | ✅ All attachments preserved |
| Save lesson with materials | ❌ Materials invisible until click | ✅ Materials appear immediately |
| Data format from API changes | ❌ UI breaks | ✅ Handles multiple formats |
| User unchecks asset | ⚠️ Inconsistent behavior | ✅ Asset explicitly detached |

---

## 🔐 Security & Data Integrity

### **Audit Trail**
Every attachment change is now explicit:
- Check asset → `courseAssetIds` includes that ID
- Uncheck asset → `courseAssetIds` excludes that ID
- No silent modifications

### **Fail-Safe Defaults**
- Missing data → Empty array `[]`, not undefined
- Unknown format → Graceful fallback
- Null-safe extraction with `??` operators

---

## 📝 Developer Notes

### **When Adding New Asset Types**
If you add new asset types (e.g., video, quiz):
1. Ensure backend returns consistent format
2. Update `normalizeLesson()` if needed
3. Asset ID extraction already handles unknown formats

### **When Modifying Save Logic**
Remember:
- `courseAssetIds` is a **replacement set**, not a delta
- Backend will detach any ID not in the array
- Always send complete list of desired attachments

### **Common Pitfalls to Avoid**
❌ Don't reset `selectedLessonAssetIds` on modal close/reopen  
❌ Don't assume asset structure without normalization  
❌ Don't use derived state for asset selection  
✅ Always hydrate from lesson data on edit  
✅ Always normalize API responses  
✅ Always preserve state during user session  

---

## 🔄 Related Components

This fix impacts:
- `/app/admin/courses/[id]/edit/page.tsx` (main fix location)
- Backend API: `POST /api/admin/courses/lessons` (expects `courseAssetIds[]`)
- Database: `LessonAsset` join table (relationship mapping)

---

**End of Documentation**
