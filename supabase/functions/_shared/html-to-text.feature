Feature: HTML → text is stripped safely at one owner
  The single owner supabase/functions/_shared/html-to-text.ts turns untrusted
  rich-text/email HTML into text. It must resist the bypasses CodeQL flagged in
  the old per-handler strippers. Executable proof: html-to-text.test.ts.

  @security
  Scenario: Nested tag reconstruction cannot survive a single pass
    Given HTML "<scr<script>ipt>alert(1)</scr</script>ipt>"
    When it is passed through htmlToPlainText
    Then the result contains no "<script" substring
    # a single-pass regex would leave a live <script> after removing the inner one

  @security
  Scenario: A ">" inside an attribute does not defeat tag removal
    Given HTML "<a title=\"a > b\" href=\"x\">link</a>"
    When it is passed through htmlToPlainText
    Then the result contains no "<" character
    And the result contains "link"

  @security
  Scenario: Entities are not double-unescaped
    Given HTML "5 &amp;lt; 10"
    When it is passed through htmlToPlainText
    Then the result is "5 &lt; 10"
    # &amp; is decoded LAST, so &amp;lt; stays literal text and never becomes "<"

  @security
  Scenario: script and style bodies are dropped, not leaked as text
    Given HTML "<style>.x{color:red}</style><p>Hi</p><script>steal()</script>"
    When it is passed through htmlToPlainText
    Then the result contains "Hi"
    And the result does not contain "color:red"
    And the result does not contain "steal()"

  @security
  Scenario: stripActiveContent removes active vectors but keeps benign markdown
    Given text "# Heading\n<script>alert(1)</script>\n**bold**"
    When it is passed through stripActiveContent
    Then the result contains "# Heading" and "**bold**"
    And the result contains no "<script" and no "alert(1)"
