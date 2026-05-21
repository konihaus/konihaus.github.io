# Internationalization Implementation Guide

## Overview
The i18n system is now set up with:
- **4 translation files**: `/translations/de.json`, `/translations/en.json`, `/translations/fr.json`, `/translations/it.json`
- **main.js**: Updated with i18n functions and language switching logic
- **Language selector**: To be added to the navigation

---

## Step 1: Add Language Selector to Navigation

Add this after the nav links (around line 42 in index_kh.html):

```html
<!-- LANGUAGE SELECTOR -->
<div class="lang-selector">
  <button data-lang="de" class="lang-btn active">DE</button>
  <button data-lang="en" class="lang-btn">EN</button>
  <button data-lang="fr" class="lang-btn">FR</button>
  <button data-lang="it" class="lang-btn">IT</button>
</div>
```

Add minimal CSS to styles.css:
```css
.lang-selector {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.lang-btn {
  padding: 4px 10px;
  border: 1px solid var(--ink-2);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.lang-btn.active {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

.lang-btn:hover:not(.active) {
  border-color: var(--forest);
}
```

---

## Step 2: Add data-i18n Attributes to HTML Elements

### Example 1: Simple Text (Navigation)
```html
<!-- BEFORE -->
<li><a href="#packages">Pakete</a></li>

<!-- AFTER -->
<li><a href="#packages" data-i18n="nav.packages">Pakete</a></li>
```

### Example 2: HTML Content (Hero H1)
```html
<!-- BEFORE -->
<h1 class="hero__h1">Ihr Zuhause.<br><em>Intelligent.</em><br>Privat.</h1>

<!-- AFTER -->
<h1 class="hero__h1" data-i18n="hero.h1" data-i18n-html="true">Ihr Zuhause.<br><em>Intelligent.</em><br>Privat.</h1>
```

### Example 3: Buttons
```html
<!-- BEFORE -->
<button class="nav__cta">Kostenlose Beratung</button>

<!-- AFTER -->
<button class="nav__cta" data-i18n="nav.cta">Kostenlose Beratung</button>
```

### Example 4: Form Inputs
```html
<!-- BEFORE -->
<label for="n">Name</label>
<input type="text" id="n" placeholder="Max Muster" required>

<!-- AFTER -->
<label for="n" data-i18n="contact.form_name_label">Name</label>
<input type="text" id="n" data-i18n="contact.form_name_placeholder" placeholder="Max Muster" required>
```

### Example 5: Select Options
```html
<!-- BEFORE -->
<select id="i">
  <option value="">Bitte wählen...</option>
  <option>Essential — Safe at Home (CHF 49/mo)</option>
  <option>Peace of Mind — Advanced (CHF 89/mo)</option>
  ...
</select>

<!-- AFTER -->
<select id="i" data-i18n-options="contact.form_interest_o1, contact.form_interest_o2, contact.form_interest_o3, contact.form_interest_o4, contact.form_interest_o5">
  <option data-i18n="contact.form_interest_p1" value="">Bitte wählen...</option>
  <option>Essential — Safe at Home (CHF 49/mo)</option>
  <option>Peace of Mind — Advanced (CHF 89/mo)</option>
  ...
</select>
```

---

## Step 3: Quick Update Checklist

Here are the key sections to update with `data-i18n` attributes:

### Navigation (lines 30-48)
- [ ] Logo/wordmark
- [ ] Nav links (packages, process, about, contact)
- [ ] CTA button

### Hero Section (lines 63-105)
- [ ] Eye text
- [ ] H1 heading
- [ ] Subtitle
- [ ] Buttons

### Trust Section (lines 109-123)
- [ ] All 5 trust items

### Intro Section (lines 126-199)
- [ ] Eye text, h2, paragraphs
- [ ] Card titles and descriptions

### Packages Section (lines 201-297)
- [ ] Eye, h2, subtitle
- [ ] Tab buttons
- [ ] Package names, tags, prices
- [ ] Button labels

### Form Section (lines 661-684)
- [ ] All form labels
- [ ] Placeholders
- [ ] Submit button

### Footer (lines 690-735)
- [ ] Tagline
- [ ] Column titles
- [ ] All links
- [ ] Copyright

---

## How It Works

1. **Language Storage**: Language preference is saved in `localStorage` and persists across page reloads
2. **Translation Keys**: Format is `section.key` (e.g., `nav.packages`)
3. **Auto-Update**: When language changes, all elements with `data-i18n` attributes are automatically updated
4. **HTML Content**: Use `data-i18n-html="true"` for content with HTML tags (like `<br>` or `<em>`)
5. **Form Handling**: The form already sends language info in `formData.language`

---

## Testing

After updating the HTML:

1. Open the page in a browser
2. Click language buttons (DE, EN, FR, IT)
3. Verify all content changes
4. Check browser console for any errors
5. Test localStorage: `localStorage.getItem('lang')` in console

---

## Translation Key Structure

All translation keys follow this pattern:

```
section.key
├── nav (navigation)
├── hero (hero section)
├── trust (trust section)
├── intro (introduction)
├── packages (pricing)
├── process (how it works)
├── why (why konihaus)
├── devices (devices & tech)
├── about (about koni)
├── testimonials (reviews)
├── cta (call to action)
├── contact (contact form)
└── footer
```

Check the JSON translation files for all available keys.

---

## Need Help?

The i18n system provides:
- `i18n.currentLang` - Get current language
- `i18n.t(section, key)` - Get translation programmatically
- `i18n.setLanguage(lang)` - Change language

Example:
```javascript
// In console or JavaScript
i18n.t('nav', 'packages')  // Returns "Packages" if English is selected
```
