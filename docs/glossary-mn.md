# Mongolian glossary

One word per idea, in the web messages (`apps/web/messages/mn/*.json`), the API's Mongolian texts (errors, emails, SMS) and the
admin. `apps/web/src/i18n/glossary.test.ts` and `apps/api/tests/core/test_glossary.py` fail if a retired form comes back or an
English word is left in a Mongolian message (brands and standards such as Angel, Google, QPay, JPEG, MB are allowed).

| Idea | Use | Not |
| --- | --- | --- |
| Bag (cart) | Сагс | Тэрэг |
| Checkout / place the order | Захиалах | Төлбөр хийх (that is the payment step) |
| Wishlist | **Хадгалсан бараа** | Хүслийн жагсаалт |
| Search by photo | **Зургаар хайх** | Харагдацаар хайлт |
| Inventory (the section) | **Нөөц** | Агуулах |
| Warehouse worker (the role) | **Агуулахын ажилтан** | |
| Quantity left | **үлдэгдэл** | нөөц (for the number) |
| Activity log (staff changes) | **Үйлдлийн журнал** | Лог |
| Overdue to ship | **Илгээх хугацаа хэтэрсэн** | Хоцорсон |
| Shipping queue | **Илгээх дараалал** | |
| Complete the look | **Хослуулах бараа** | Look |
| Quick add (card) | **Түргэн нэмэх** | |
| Buy again | **Дахин захиалах** | |
| Security activity (account) | **Аюулгүй байдлын үйлдэл** | Аюулгүйн лог |
| New device | **Шинэ төхөөрөмж** | |
| Product | Бараа | Бүтээгдэхүүн (except in code comments) |
| Customer | Хэрэглэгч | Үйлчлүүлэгч |
| Order status | Төлбөр хүлээгдэж байна · Төлөгдсөн · Илгээсэн · Хүргэгдсэн · Цуцлагдсан · **Буцаагдсан** | Мөнгө буцаасан |
| Refund (action / event) | Буцаан олгох · Төлбөр буцаагдсан | Мөнгө буцаах |
| Review | Сэтгэгдэл | Тойм |
| Sign in / out | Нэвтрэх / Гарах | Логин |
| Suspend an account | Түр хаах · сэргээх | Блоклох |
| Tracking number | **Илгээмжийн дугаар** | Хяналтын дугаар |
| Delivery address | **Хүргэлтийн хаяг** | Хүргэх хаяг |
| Usage / occasion (product attribute) | **Зориулалт** | Хэрэглээ |
| Next page | **Дараагийн** | Дараах |

Style: instructions end in **-на уу / -үү** ("Нэр оруулна уу"), buttons are short verbs ("Хадгалах", "Болих"), errors say what
happened and what to do next. Marketing copy on the home page may be warmer (-аарай).
