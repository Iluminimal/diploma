"""Мөнгөн дүнг имэйл, логт бичих. Үнэ бага нэгжээр хадгалагдана: төгрөг x 100."""


def format_minor(amount: int, currency: str) -> str:
    """ "125,300 MNT". Төгрөгийн бага нэгж (мөнгө) харуулахгүй."""
    if currency == "MNT":
        return f"{amount // 100:,} MNT"
    return f"{amount / 100:,.2f} {currency}"
