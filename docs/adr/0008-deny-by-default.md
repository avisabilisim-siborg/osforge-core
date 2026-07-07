# ADR 0008: Deny By Default

## Status

Accepted

## Context

Otonom sistemlerde belirsiz yetki veya belirsiz policy sonucu fail-open davranmamalidir.

## Decision

Policy ve authorization katmanlari explicit allow olmadiginda `DENY` sonucu uretir. Eslesen policy rule yoksa policy engine `DENY` doner.

## Consequences

- Bilinmeyen permission islemi geciremez.
- Belirsiz policy islemi geciremez.
- Yeni kabiliyetler explicit policy ve permission tanimi ister.
- Bos, null veya yanlis runtime kimlikleri gecerli context sayilmaz.
