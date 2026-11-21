"""Нэг процесс доторх бүх загварын GPU (MPS/CUDA) дуудлагыг дараалуулах түгжээ.

MPS-ийг нэг дор олон thread-ээс ажиллуулж болохгүй. Embedder, detector тус бүр өөрийн worker
thread-тэй тул хоёр хүсэлт давхцахад embedding ба detection нэг зэрэг GPU-д орж болно. Forward
pass бүрийг энэ түгжээнд оруулснаар тэдгээр дарааллаар явна (CPU дээр ч хор хөнөөлгүй).
"""

import threading

GPU_LOCK = threading.Lock()
