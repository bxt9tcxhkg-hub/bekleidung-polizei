import { describe, it, expect } from 'vitest'
import { escHtml } from './printDocs'

describe('escHtml', () => {
  it('escaped HTML-Sonderzeichen', () => {
    expect(escHtml('A & B <c> "x"')).toBe('A &amp; B &lt;c&gt; &quot;x&quot;')
  })
})
