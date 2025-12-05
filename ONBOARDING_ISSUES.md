# Onboarding & Application Data Issues

**Last Updated:** December 4, 2025  
**Status:** 🚨 CRITICAL ISSUES IDENTIFIED

---

## 🚨 CRITICAL ISSUES (Must Fix Before Production)

### 1. **FALSE US CITIZENSHIP CLAIM**
- **Issue:** Hardcoded `export_controls: "us_citizen"` for all Greenhouse applications
- **Impact:** Legal fraud if user is not a US citizen
- **Affected:** 16/16 Greenhouse submissions (100%)
- **Risk Level:** 🔴 **CRITICAL - LEGAL LIABILITY**
- **Fix Required:** Collect actual citizenship status during onboarding
- **Field Needed:** `citizenship_status: 'us_citizen' | 'permanent_resident' | 'work_visa' | 'no_authorization'`

### 2. **INCONSISTENT VISA SPONSORSHIP ANSWERS**
- **Issue:** `visa_sponsorship` randomly changes between `"yes"` and `"no"`
- **Affected:** 12 submissions show "yes", 4 show "no" (inconsistent logic)
- **Impact:** Could cause automatic rejection or incorrect filtering
- **Risk Level:** 🔴 **CRITICAL - APPLICATION REJECTION**
- **Fix Required:** Use consistent value from user's vault data
- **Root Cause:** Likely a bug in the ATS form filling logic

### 3. **AMBIGUOUS WORK AUTHORIZATION**
- **Issue:** Hardcoded `work_authorization: "no"` (meaning unclear - no sponsorship needed? or no authorization?)
- **Impact:** Could be interpreted wrong by ATS systems
- **Risk Level:** 🟡 **HIGH - MISINTERPRETATION RISK**
- **Fix Required:** Calculate from user's actual visa/work authorization status

---

## ⚠️ HIGH-PRIORITY ISSUES (Reduces Success Rate)

### 4. **MISSING LINKEDIN URL**
- **Issue:** All submissions have `linkedin: ""` (empty)
- **Impact:** 70% of recruiters expect LinkedIn profiles; empty URL reduces credibility
- **Affected:** 16/16 Greenhouse submissions
- **Risk Level:** 🟡 **HIGH - REDUCES CREDIBILITY**
- **Fix Required:** Collect LinkedIn URL during onboarding

### 5. **RESUME USED AS COVER LETTER**
- **Issue:** `cover_letter: "resume.pdf"` (using resume file as cover letter)
- **Impact:** Unprofessional, could confuse recruiters
- **Affected:** 16/16 Greenhouse submissions
- **Risk Level:** 🟡 **MEDIUM - LOOKS UNPROFESSIONAL**
- **Fix Required:** Either generate a cover letter, leave blank if optional, or collect separate file

### 6. **CONSERVATIVE CLEARANCE DEFAULT**
- **Issue:** Hardcoded `clearance_eligibility: "no"` for all users
- **Impact:** Disqualifies eligible users from defense/government jobs
- **Risk Level:** 🟡 **MEDIUM - MISSED OPPORTUNITIES**
- **Fix Required:** Ask during onboarding or make it conditional based on job

### 7. **ASSUMED COUNTRY**
- **Issue:** Hardcoded `country: "us"` for all users
- **Impact:** Wrong for international users
- **Risk Level:** 🟡 **MEDIUM - INCORRECT DATA**
- **Fix Required:** Extract from address or ask explicitly

---

## 🎯 MISSING CRITICAL FIELDS (Job Matching)

### 8. **NO TARGET ROLE/JOB TITLE**
- **Issue:** System doesn't know what role user wants to apply for
- **Impact:** Can't filter jobs by role relevance
- **Current State:** Only has `preferences.locations` and `preferences.salary_min`
- **Fix Required:** Add `target_roles: string[]` to preferences
- **Examples:** 
  - "Software Engineer"
  - "Senior Full Stack Developer"
  - "DevOps Engineer"
  - "Machine Learning Engineer"

### 9. **NO YEARS OF EXPERIENCE**
- **Issue:** Can't filter by seniority level
- **Impact:** Applying to senior roles when user is junior (or vice versa)
- **Fix Required:** Add `years_of_experience: number` to profile
- **Use Cases:**
  - Filter out "10+ years required" jobs
  - Target appropriate seniority levels
  - Better salary expectations

### 10. **NO SENIORITY LEVEL PREFERENCE**
- **Issue:** Can't distinguish between "entry-level", "mid-level", "senior", "staff", "principal"
- **Impact:** Wastes applications on mismatched levels
- **Fix Required:** Add `seniority_levels: string[]` to preferences
- **Options:** `['entry', 'mid', 'senior', 'staff', 'principal', 'lead']`

---

## 📊 LINKEDIN FILTER CONSIDERATIONS

### Current LinkedIn Filters Available:
1. **Keywords/Job Title** - ✅ Partially supported (search term)
2. **Location** - ✅ Supported (`preferences.locations`)
3. **Date Posted** - ⚠️ Not configurable by user
4. **Experience Level** - ❌ **MISSING**
   - Entry level
   - Associate
   - Mid-Senior level
   - Director
   - Executive
5. **Company** - ⚠️ Could add blacklist/whitelist
6. **Job Type** - ❌ **MISSING**
   - Full-time
   - Part-time
   - Contract
   - Temporary
   - Volunteer
   - Internship
7. **Remote** - ✅ Supported (`preferences.remote`)
8. **Industry** - ❌ **MISSING** (could be useful)
9. **Salary** - ✅ Supported (`preferences.salary_min`)
10. **Easy Apply** - ✅ Supported (we filter for this)

### Missing LinkedIn Filters in Our System:
- ❌ Experience Level (critical!)
- ❌ Job Type (full-time, contract, etc.)
- ❌ Industry preferences
- ❌ Company size preference
- ❌ Benefits filters (health insurance, 401k, etc.)

---

## 📋 CURRENT ONBOARDING COVERAGE

### ✅ What We Collect (Good):
1. ✅ First Name - `profile.identity.first_name`
2. ✅ Last Name - `profile.identity.last_name`
3. ✅ Email - `profile.identity.email`
4. ✅ Phone - `profile.identity.phone`
5. ✅ Address - `profile.identity.address`
6. ✅ Resume - Stored in vault
7. ✅ Visa Type - `profile.work_auth.visa_type`
8. ✅ Sponsorship Required - `profile.work_auth.sponsorship_required`
9. ✅ Job Preferences - `profile.preferences.*`
10. ✅ Work History - `history.employment[]`
11. ✅ Education - `history.education[]`
12. ✅ EEO/Compliance Settings - `compliance.*` and `policies.*`

### ❌ What We DON'T Collect (Critical Gaps):
1. ❌ LinkedIn URL
2. ❌ Portfolio/Website URL
3. ❌ Citizenship Status (🚨 CRITICAL)
4. ❌ Target Role/Job Titles
5. ❌ Years of Experience
6. ❌ Seniority Level Preference
7. ❌ Security Clearance Eligibility
8. ❌ Cover Letter (separate from resume)
9. ❌ Job Type Preference (full-time, contract, etc.)
10. ❌ Country Code (structured)

---

## 🔧 RECOMMENDED SCHEMA UPDATES

### **1. Update `UserProfile.identity`**
```typescript
identity: {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  country_code: string;              // ← NEW: ISO country code (e.g., "US", "CA", "IN")
  linkedin_url?: string;             // ← NEW: LinkedIn profile URL
  portfolio_url?: string;            // ← NEW: Personal website/portfolio
}
```

### **2. Update `UserProfile.work_auth`**
```typescript
work_auth: {
  visa_type: string;
  sponsorship_required: boolean;
  citizenship_status: 'us_citizen' | 'permanent_resident' | 'work_visa' | 'no_authorization';  // ← NEW (CRITICAL!)
  clearance_eligible?: boolean;      // ← NEW: Security clearance eligibility
  clearance_level?: 'none' | 'secret' | 'top_secret' | 'ts_sci';  // ← NEW: If has clearance
}
```

### **3. Update `UserProfile.preferences`**
```typescript
preferences: {
  // Existing
  remote: boolean;
  locations: string[];
  salary_min: number;
  salary_currency: string;
  start_date: string;
  
  // NEW - Job Matching
  target_roles: string[];            // ← NEW: ["Software Engineer", "Full Stack Developer"]
  seniority_levels: string[];        // ← NEW: ["mid", "senior"]
  job_types: string[];               // ← NEW: ["full_time", "contract"]
  industries?: string[];             // ← NEW (optional): ["Technology", "Finance"]
  company_sizes?: string[];          // ← NEW (optional): ["startup", "midsize", "enterprise"]
}
```

### **4. Add to `UserProfile` (top-level)**
```typescript
export interface UserProfile {
  // Existing sections
  identity: { ... };
  work_auth: { ... };
  preferences: { ... };
  
  // NEW - Experience Summary
  experience: {
    years_total: number;             // ← NEW: Total years of professional experience
    years_in_role: number;           // ← NEW: Years in current role/specialty
    current_level: 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead';  // ← NEW
  };
}
```

### **5. Add Cover Letter to Vault**
```typescript
// In vault stores, add a new store:
// "cover_letter" - encrypted blob of cover letter file or generated text
```

---

## 📊 SEVERITY SUMMARY

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 **CRITICAL** | 3 | False citizenship claim, inconsistent visa sponsorship, ambiguous work auth |
| 🟡 **HIGH** | 4 | Missing LinkedIn, resume as cover letter, clearance default, assumed country |
| 🟠 **MEDIUM** | 3 | Missing target roles, missing years of experience, missing seniority level |
| 🔵 **LOW** | 4 | Missing job type, missing industry, missing company size, missing portfolio |

**Total Issues:** 14

---

## 🎯 PRIORITIZED ACTION PLAN

### **Phase 1: Critical Fixes (This Sprint)**
1. ✅ Add `citizenship_status` field to onboarding
2. ✅ Fix visa sponsorship logic inconsistency
3. ✅ Calculate work authorization from vault data (don't hardcode)
4. ✅ Add LinkedIn URL collection
5. ✅ Fix cover letter handling (don't use resume)

### **Phase 2: Job Matching (Next Sprint)**
6. ✅ Add `target_roles` to preferences
7. ✅ Add `years_of_experience` to profile
8. ✅ Add `seniority_levels` to preferences
9. ✅ Add `job_types` to preferences (full-time, contract, etc.)
10. ✅ Update LinkedIn search to filter by experience level

### **Phase 3: Polish (Future)**
11. 🔲 Add portfolio URL collection
12. 🔲 Add security clearance questions (conditional)
13. 🔲 Add industry preferences
14. 🔲 Add company size preferences
15. 🔲 Generate or collect separate cover letters

---

## 📈 EXPECTED IMPACT

### **After Phase 1 (Critical Fixes):**
- ✅ Legal compliance (no false citizenship claims)
- ✅ Consistent application data (no random values)
- ✅ Professional profile (LinkedIn included)
- ✅ Estimated Success Rate: **+25%**

### **After Phase 2 (Job Matching):**
- ✅ Better job targeting (only apply to relevant roles)
- ✅ Appropriate seniority matching (no junior → senior mismatches)
- ✅ Reduced wasted applications
- ✅ Estimated Success Rate: **+40%**

### **After Phase 3 (Polish):**
- ✅ Complete professional profile
- ✅ Access to government/defense jobs (clearance)
- ✅ Industry-specific targeting
- ✅ Estimated Success Rate: **+60%**

---

## 📝 NOTES

- **Current Overall Accuracy:** 53% (9/17 fields correct)
- **Target Accuracy:** 95%+ (16/17+ fields correct)
- **Critical Issue Count:** 3 🚨
- **Must Fix Before Launch:** Phase 1 items are non-negotiable

---

## 🔗 RELATED DOCUMENTS

- [SHEETS_BACKUP.md](./SHEETS_BACKUP.md) - Backup system documentation
- [ui/src/lib/types.ts](./ui/src/lib/types.ts) - Current ProfileVault schema
- [ui/public/mocks/mock-submissions.log](./ui/public/mocks/mock-submissions.log) - Test submission data

---

**Last Reviewed:** December 4, 2025  
**Next Review:** After Phase 1 implementation

