| Model | Dim | Vision params (M) | ms/image (batch 32) | mAP@10 category | mAP@10 colour | mAP@10 strict | P@10 category | nDCG@10 category |
|---|---|---|---|---|---|---|---|---|
| fashion-clip | 512 | 87.5 | 7.6 | 0.830 | 0.281 | 0.256 | 0.866 | 0.875 |
| marqo-fashion-siglip | 768 | 92.9 | 27.0 | 0.842* | 0.268* | 0.247* | 0.875 | 0.885 |
| resnet50-imagenet | 2048 | 23.5 | 11.4 | 0.750* | 0.183* | 0.162* | 0.799 | 0.811 |
| random ranking | - | - | - | 0.021 | 0.002 | 0.001 | 0.057 | 0.057 |

`*` = the 95% paired-bootstrap interval of the mAP@10 difference to `fashion-clip` excludes 0. 41885 queries over 41885 products.
