---
tags: [design, test]
aliases: [Everything Sample]
status: draft
done: true
date: 2026-10-14
related:
  - Other
  - Tasks
---

# Heading 1 Everything
## Heading 2 Section
### Heading 3 Subsection
#### Heading 4
##### Heading 5
###### Heading 6

Paragraph with **bold**, *italic*, ~~strikethrough~~, ==highlight==, `inline code`, a [[Other|wikilink]], an unresolved [[Nowhere]], an [external link](https://example.com), a #tag and #nested/tag, and a footnote[^1]. Mixed 中英文 text 与 English 混排，数字 12345 and v1.0.0.

- Bullet one
- Bullet two
  - Nested bullet
    - Deeper bullet
- Bullet three with `code` and #tag

1. Ordered one
2. Ordered two
   1. Nested ordered
3. Ordered three

- [ ] Open task
- [x] Done task with `v0.2.7` chip
- [x] Done task with #tag and [[Other]] link
- [x] 完成的中文任务 `v1.0.0`
- [/] In progress
- [-] Cancelled
- [>] Forwarded
- [!] Important
- [?] Question
  - [ ] Nested open
  - [x] Nested done

> A blockquote line one.
> Line two with **bold** and `code`.

> [!note] Note callout
> Body of the note callout with a [[Other]] link.

> [!tip]+ Foldable open tip
> Hidden-able body.

> [!warning]- Collapsed warning
> You should not see this until expanded.

> [!danger] Danger
> Danger body.

> [!quote] Quote callout
> To be or not to be.
>
> > [!info] Nested info
> > Nested body.

| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |
| `code` | **bold** | #tag |
| 中文 | 混排 English | 123 |

```js
function hello(name) {
  // comment
  return `Hello, ${name}!`;
}
```

```
plain fenced block
```

Inline math $e^{i\pi}+1=0$ and block math:

$$
\int_0^1 x^2\,dx = \tfrac13
$$

---

![[Other]]

[^1]: Footnote text.
