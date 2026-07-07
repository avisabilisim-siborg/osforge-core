# Policy Engine

Policy engine, authorization sonrasi karar katmanidir.

Karar modeli:

- `ALLOW`
- `DENY`
- `REQUIRE_APPROVAL`

Belirsizlik durumunda karar `DENY` olur. Eslesen kural yoksa sistem explicit allow kabul etmez.

Policy kurallari resource type ve action uzerinden eslesir. `DENY`, `ALLOW` uzerinde onceliklidir. `REQUIRE_APPROVAL`, execution izni vermeden once approval gerektirir.
