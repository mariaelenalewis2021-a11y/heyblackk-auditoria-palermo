(() => {
"use strict";
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAABPCAQAAACdI3NdAAAtX0lEQVR42u2dd7xUxdnHvzNnb+FyQXpHQFGwxULsKIhCBMXYTURjjQWxAYIithhjRw0W7JqY2HuNDTWWAIoVbCAISu/cvntm3j/OuXt3z5ndPWd3b+G9d87HaPbuzpl55nl+8zzPPPM80NJa2v/HJlpI0LKsLa2lbSlcrZusROmWBcqVvDIr4BLYaYkvkVktjp3wBlmvs1eG8cksQdwORLEg89GoPM1fJ/yTTct2BVWjCqWFDbRnU6A1yV+TiEAzd1ZVowN918qSs1Wat4sseqmPkVghpEu3aFjNp1lJMPj/ewMWKAo5g6MZRbQBwQqXviVsRVe605VutEGgKWMta1jPStZRSTmxBIFVgWCrpSUtsGZr+qBCwZdGU8RnbEIYCS7QbEdPahCBe9VoImxiHlG3h470pTJrnSfT2wr4jkrf5/3pHpIWCotKPgvAeJ3oj5W2b0WEJSx2jZrudMYOQcHkFqOaKjZTnqCxBTdJBJo+9Kcy1PsVEptv2ZCCL+ofrGBXJnAiFgfyX2S9w3Sd+dmXHdmNwfSmLW1pm6QdV1DBZsrZwI98w08s42dWBliVjuzu6okiIFeDppDv+TnFN3qyHSJAfxrBjyxFoBFoOrEnFchQIwHJAn5OwQu92C7AzJxf/sCvTi8RJDYncC2gqEYHUNNsJEVoIgzhkxSDkdhcwNnE0FQHMG00NoVICpjN71mLRBLjEO6lGkk1Ou/GoaKAU3nDx9LnMA6NTU0goLSJUIDkG/aO75ypAeAAHqGYGmLG2SgERUj+xjVIwOZEpqDRWc7fppINrGItK/iVOXxFhatvBTFcLGKcxDVUIal2dYhM77MowGIDx/JfZIMaZNI1sbbhFM6gJwrNWQ0AWI75aXEoIxjC9rRKMOuVa/opNMWU0AmAwUANm/meb1jILD5nUxqO2ZbH6AREiQaSTItCBDZn8ahBMgWafZlBe6oySkchFuOYEQes7XgeCxF4JBEKgRrONAKWIw0zaE2VqzSl7qkYwVk8XMtRAujBGJ5mnbvoQZ6V3MfRtE6JjwLYjvN4h7LAfcb4kqvY2xUNAXTmZB5nfYhxhXsu9IxfAH34M29SHqKXhfyNfQOxd1uO4yVq0vT1JefT29UWoDen8iIb8zLX5czlTg6kTdxIzKw59OJ0nmdDiLcs4U4OS8MX9dn6cjU/otHYxNAsple9ekEdH0wrjue1OJcrolTFqVFNZcJqVxMjRiyJXmv4nCcZQz8Kje8oYH+mMJdoANrbaDSLuIWRtE456hKG82yAntZyJV0S1rGIIVzFF+5bgjzf81eGpxiJANowmlcD9LOWSXQwcdQALuMbNDY2yvjYKDRzXKEKtgPtw12sQhNL0acihibKsxzhCpO3bculfOWyoW14MgOh8yT/KorNjSkESzCYh6lKOWrbHbXmPU52d87g7VC+9fUcRbOKS2ln+P5ApjLfnUeY+av4vFUCLT5kDK0CaUy1bWeuY0EGvtBoPuAMujaSW2MXbmSpO2s7LnTnApF69FrBcF5z36cSVmMZb3APf+ZIRnIU5/MQM91tp45iDi1r12UVx6fZRko5ghfc9Uu1AjaajzmTLoFGfxGVKdYzhkLzKnsZf7cVx/C6S99U0qzQvMsYOgQYRxHXUuPyqAkXNE+yi3nJhWtX3p5GADRVXOMKaGbPRt3utjvvur83o/mPjEw4afGOzLG870AZ+lBoVvAU/+Zx/u15nuA53mVFwptszy+fTXuK8nvmx/ctEy2WMZaSgLRIpkl/vo0viEYTRfM5gxIEwbsufbg7/l7vOFb6Zv4kLzOLygSYqmUC7cLs0EB+kTpa9OdfxvfXflbGeZSGpEU+oeOiuBAl0vQFiuppPBbQjr9T7oKQQ2WNZj7ns7MPeorZi0vj+p9KoF0t4E9JAa4ifpJ/KhtSSpFG8ze2MsqQn14WcJdLo+QniqaSKcYtrVaeizg35Uicz8a7pnEm2ltIBM8ZpMyRjs2ci0wN5NIl2NXGfVuhiXIB4Hi+gi+tBFrznnGKNoqF7OiSUaQd119d9PYS+CWKsYhg+Z4CWtGZbTmSF1iZwFS181mUYdQ78rkRshSaVYxyaRFWIAqBMS6I1I7pPbqn7Kt2/jca1kWhec0w80JK6c6uXMp8YknzjrmsMCGQ67Xu/RYPx7UX7xgqOCpLWuTL7d2bb5OAQLt6626BzN9s4Oq3fJ7AUco1oy6kvfudSJwjI/ERdOB8Vw+0PRRUXJ9mpMLlxyOo8piUtVIQ5fIQKxBBsCO/etbT0fPnsx+pQw6E+4Y/UZ2kIdbJcw1nhxiJBQyh0oMNzrg+YVcyhvZYQAkfJLF4nSb0HIUuPodjqAiwq29YtQI3BijIiMWCrfjQ10MUzfOB1P4uXMEPCbuAQrMhzVycUe/nW9ZaJn2dAmRWHhKJpC8r3DHYaD6iSwbBsoAOzPKti0LzUob3Hc+sJO2oVre7k+LAvqYI0IOFhhW00dwG9XSWGxyypvrWyUZzWd69aY7W8EfWu5qrjutYb7inXpZh662FHOjJw1R7IMtGc3+CPm3mmgLgPrTPBxpF8xGFWIElUwAlzPZt4JqX6OZKW3oNTfK0YSt3pFGEkAuBoBOrkvjK+a/HaJdxJAkKtvLtV5ooJ2ftExAInjCK248UB9znYbJRhX2BQtd4Sfc4btnpRF1CKzSb6JiWoS1gokeJrwWstyjJ0txwNIJlceiYT58APiVHKLVhXV7OOPN23OEx6Bzhnk4kMNBIYLpRN9jE/o1gCHrH1o+FntEpNF/Ez+3yB40wGTvhXc6283dKMsJ2rbZwHD8lmJJOTy9SmoELChAcTrmPA2wUE4GCULMo5dMEeXT8yFcgAnk3LeBPPuBU2FRzSij/qAC6siaBN2NoNnFJwJG4mLYvaw2Lv5Tts96vLOBc3+5go7knBOTtz0bPHu8AVkEgf4yzoH/kp7jYV7BD2l8KBG35j0+vUGh+Ze8sqWEh2IeN7g69kgMDmS0SwSFsMKzLywG0I7jM98somosDs5dA8HvDgYbmY/MZTgO73eGqJD+d81QyKpQAZRYvwdVJ24azlV/p8z+mP1vchbcSuMpGM5deGXqQQGe+NXDAJvYINUsLwc4sj/cUQ7OKMXFXSBA6bO9uucnSvNR17wTfagRDqIr3FEXzC0eH8YVawHYsSrlbZceYEeBYN6Iomd0nBByaAPr5iBQcsOrckfszz51dDcMykFcAB7PJJwiOfmJlRY0IcIXL9DEXMkSgddmFX7IALFwV/S6fIaJYw+4BaSeA3/ocBTE0zwamf/01CxjEOp8vRHNvHgFLIpmccC5ae5RzHZEQARQOZHXn0biWZaNZldHf5ugcn3jsFIVmOZ1DrUDEVR+i8bl8z0EhzHpHa//BQ+0Ymm/oERI64Za4zWOj+Yb9wjkYJNDTPXhPJsusHBlquM/QjKE5NfDOBB1ZnBNg1Srle/GjyyyZFdg6U8jrvVnH4CyEQSJoz5eutvkCbQICtgS2NZo9Lweiv6C9b3d2TJHgfLEt1Qb6PxLYfV+/gHUImw17/vdskxfIclZpDGU+f8s/aR36DRJow53x8ABNWQBN2wLeNkjm0lCOGomgTfw4SaH5L7/JYgZfGwDrU9qH6EkCvfgpfo6teYcB6X9v/lON8RZWrjHD6ykzXKatDNGDnfMYNArJbC5iEwLB9oG8R7fzky8aV9GeSZRkIaqa49mZGBGWcT2bCX45OZohmj4d5STr+TveQFnNoSFgN2aMXq9GNzJcOVdyDqMU5QsE3p4D8wKnAs1e3EDrhHcoBJ8ymXJ3BMGbQrKZi7nTjdGHiDEGzy+ttoFfbGIhZijQjGM3NBKF4BX+xFdYoWdgGzkkSvDLXwK4iH4oJBrBs5zM9+lHIlMMRqUArFwWPka18dNwwp57U0he5SYUBPDKKSQLucGnBwkUh3KUR0SCMEtXJrnu8PuYFWpfc9ZFZzlrwdOsSAJe56LwOSH2RG0Ew8ZuAk0XhvrG58DIKIqwc4QsgaIzN9ELO04rjaCcq1iGlcWaKCRRJnKfu4kX0C3rtQ3zK4nNAUxyNVDJE5zNIveKUe5vDZOnQ2AzitPc+4+ShzibZZlGEgawcgWLqE9v0xDyRn1+boZpJNP4L9A6wLxsBI8x06NjCTQFXEnXUPf8BJor2QYbi8+5KyRdc7nZr4E1zDT8ZSCtE8QwG+2tKbQhDHBv73nb4BwOixLbOIag4kabBgSP8J/QukniFlLNBF7AIoakh/tZNj0FD09R9GUG7dCAxWOMZRkiqzXUgfUus3mr2IE76IBCILmHC1mb+QaqbCB20kDMqE01BrtrBJVcC7RzASlTq2QyNZ5FslBsz/gQMCJRDOZ0NJIoN7KmAbIJJMPlR545OCEW2ze6UZerzgyH0Mq9pqs9FO/CYTludQLN/lzkg4UVTHN9gtnzYRnn8hURcDN5ZNMqA/NfjI48zI6ouE6zPq95NaoDyrOFzdY8RH9sJIJpXERZEMNa0jybTYR3+IielAZaLskc7vARVKC4kL0C6lgSKOIairGRvMyToT0fuQP1LwZTpwvbsSVnRhPA1gxDI/mIJ3wzsRiWUzSWQGNxMW19HrJ7+SnHLUdjsYIzWQ70znqUQX1GijY8ylBiaCwe4GwqskzRmNtIJDadeIB9iCEQ3MgEaoIBZ3MFLEezm8RPtCdIbiCQ3MoCj4UtcK5vFgQ86VOMYRgxLNZzdaPMeoOPiWOQdCt/ywSswfQHBI9zH2VJgiOBPRmSA69LYCSjkuBKAxt5OA+OEhvJHCajaR0i9DN8s4A2PMphKCQWjzAO1cAafp3W255HGY6NRHITl2VIMdMCWC6jfcwYVgYyFxSClUwl5mFRSZRhnIadUZ0XKLozFY1CcAdfZ+WqzbXFjBwQ3eJX8hg0gpV8ygd85lkjTTuDQz44HCqK+LNrcNbBjOAfLMmLOaUQ/Jtn6Ru/h1gfIGFTzAyOIoZG8ijnUgONAFcWirY8xChiSCS3MSVMDv7mC1gOMy6jJsRO+CT/8QGTRYRL6JXC4ZvcLqYfNoV84R5nN3wr9Al7BJtf2HJLI0g02zIEAcziaxQf+DxymuH0yNJPJ9DszaFJZr9GUM1zgdJdBuWuS/l3ipxY+eBzRSF3cyIxBBYPcTpVjQJXDnA+yJFEkQhu5xJjoEYLYKXYm2Wob8Nk1vp0LJv+TMiw+BLNvq67XXMNaxvcf+W09oY5LWbeFg1YcCQd0ER5jwrgCdb7QlB2Ye8suV0BJ1Po0a8sPmF2lqdrJs4SLOQCvquXdZBoWvF3TkUhsHiEsS4fNryCoGjN/RyLjYVkOpdhh5OE5g1Y4fYYjWQed/kIbKE5hwPS6FjOZdOJdEQheZwX8sbqYRlma9/8NUtZkvXRfOPryDZFHIoAlvEqIPiO2UklNwQ2BRyNzCIaSwDdOQ5vnjKYRQWRvAm9DlXNJqzHqIhbONvVru5nLNWNZAxqSrmXk+LG4CSqwhrVzR2wwgvIXXzmE29NMVdTlFJjEyh+z+HYSFZzeaM5uLUv6ttC8HQO4ahNwSDcjb3QCObwsyugT/k0LNifbQh/tCARHOMmxqujosVGXsiz0Ot6KY4mUFjcxFi3mMkMLqCyEQqEOJZIK+5hjJsTfhpTqAqv57UAVjh9TLCKm6n20E2gGMqpKYjvuNsvpBCF4DoWNwrDCKAbB/rmM59/NJK+lx8xh2G0xUbxPNXuQcZMfk06/5Jo+jEiC1jWaI5CJ9FHA+uYuwVQTQKF3MoFrjE4g0uyAYk86XlbcRcnucdT07iCqmzOKJsfYOWmeGsEz/Mc+KLeJRe7t6JM7QwGYVPAB9zfSPpVBM2JtE/wxSgElVxC2Ras7ypK+RMQYSGzXD3FYglvkxySrICRFIV0vEsU/djeE7QigM+oafKBIBJFhFu4EBuQzGBisODMejAGFe24ndOwEUhuZyoV2Y2kuQGWyFHx1kAN0/jFoyVZKAYw3qA7STSDOBeJoIK/ZrtQeVDIO3N6wp6mkAiu5bVGOq/M13ruzkAU8D4/uTMRKF4jluRhsoAR7BISZCzgd/Q0XFx6c4vgdIubON+Fq3uYQHmjGYOtuZFTXbi6lcnZ63mymcGVZg+2JpcwSY3gU+73lRoXwB8Y4vFjCTQRLqAHNpJ/8G4jmYMCxZXsFI8XU0hiXMvNjTKefK7nWW6QwZvuxRwnAOUNFns2Bk0hh4fUsDQwwGj6fUvT9vo5typu4SIUGov7mJj3qPYwWvDNnIUCJDdxKdF8BqxKoD1zDVl3PsxB0CUwgCWefExRNIcRPB9WOzePVXb5sAqA3VjAieRWmEAi6Mb/DOmCNa+wVZIBIYHRVBPDZoEbjZ09BXu65b7C5cNyjOCz4mWdnEzkqzk7QxVq//v7uFVikuk/HRolRbJA0NGtivQdpQlzsYDpnqSLNpp5tA6VhgWKed1Q36DGrR3Z0K0A+I+n2o1C87VHhiSCAqbFKzQ+ELKwW7A215AP622PLEqgxE0daaO5PkRS7jxoWCLHpzFbAVF6ch/bGpPchGkKyQpuM9x+0ozg6IRd3CkXOZ5CNJLbWNDg+oykAIVmHHchEdhoLDSvcyj3orZo/cpCcwydUGhepyxhLgrBvT7Pk2ZbhoUI9nQuhu/hgSYFzGddk3d7XMPFKBQWD3AOlY3iiHDM0r8w1tWurmdKTpfFQwKWTlsVLXMt2VgjCYdTxSNKPx5nT6rzEJ2sELzA84YMWQVMoneSY/s0hhIlwkz+VW+Qbd4eJBJFlK25l+lEiCGIIPmQ0xjFZ24h9S23aSQjsdxMX8LDqd8yB5KisWIUcVwoqkIPuhDzScnCnDe9+tU7Lf7CZSgUER5iLLFGMgYhwnVMcHND3MiUuKGddQuTWrWEDlnff7OooiuF9aZIm/U3HWdfOIG/0h+dl0rAGkk1N3EIHZK8IhaKgZzNVDdpsGZrJqKJUM5NbKinq6apjhE00Jc/cAoD3bXexFO8wQtuAKViS24RYuzCYBQWs/nKE7stsLmPPZNObS3gAPrwc8B10GCoZK2Btb47pU0HrkBxOVPQCCI8yjhijXLF2bkfeCWT3TWYxhRk7lwXCfH6nZmbA9woiuspK4BMq2YW0IN9OI1DsAJcUQ6jY81lOlejkyBLAGN5idmuAXYlvbGx+Bdv15tS3oHtkualKaSEjgxgOLvRHahhOW/wOt+w0BVdmy29KWAInaimiGco8+XR0HzAKjonQJYkRl8O5J8BeVCD4YDGASyaqDGtgfFcjYWN5mHGUdNIxiBopjAVjSDGHUx2M4vSMIAFUEifJujHgJ250RfKWQtWpfTkQDdS2c6z21Ewg6PYNSntiEDRnss4ARubgzmBGBEWc3uorNvhGGMwP6T5hg1U8SiPs8g1ZKwtXLeqpXMRR6EpYAPvG2BFsICZnJC06hLNKfw7BFx3N366sUkClkOBC7mOCDEifMnF1DSSdqWBKVyLQCH5H9di19dIzKeEtRWDs3+ihiLbuZ8SBntq69UpNDGOJz/lyyVwLFFDYcsYJwMlfIgmSowJ5H5GYz4lTJyfcqsS1f13jFi8vP0vfMx0RtMz7tcL//6mc0oogN0ox0bzOpbh5CkCnEKNrzqxZqcQo33CdxYcRTOexgkISndK6FQUHEdFnB82cSb1eZaZ6pTQoe5kou7fFWs5qf5Gkhqw8v80FGDFXKbLL2A5Z3BP+UZko/majpzjzvA92uVBoNMBVub51/6mnK+5gt3dHsUWDVjXuQB9vtFSkEBXt2huMrTfFhhuLGb6VrcGzflNELAkcG7C+jgFVg+ox5GaActJkTMpDlfO//7CHvmRujAmYYyVOfmwiuhUL2xtU+ZqOcqFpArKqaKCGB3pTVtaQ6B8VeE9BlGu5BDaJfmxJIqduYd90VhUcT0b6tVrpKmIa1PlrGI9G9hMDRat6cP2dKAVuMloS9iZnTmTZ7iP75usJybInEsZhkCwhieMoZ0KyUre4izP7yRHcTkVgWYu6Wb8vIaml6FVM5abKInzucCmDXcx0nOvsv6NQYvJXEMkaSQ9uYMjWZs7v0UCk0PwLcfnkGa2hgE8mOQEzQ9YWczlMsrc3TaGTTVRotjEUBTTiW04nCPo5nGP54dJJN9xHbd4sn1LNMe5QvM4b2WuBZJTm8dkKqikhhrKqKCaaqIo14fXjYEcxkh6UFd1Z2vGczjTeZDKLdIBb2FzIDsD8Dar04jBM5zlCanUdOcInsAKUGDOolNKv2BT8+SexM2UJN2zsLDZhbs4gWiDbUyCKBdyFRHPSDSDuZGz6wM4U0e6v59jz335uV4i3Z8L8Os9eDquuObPJHTMqhJf+XAdL7z9M33ztBunjnR/McBvd+PRhDg65db8fZwegTetpmMSOv63m11KHJL23e2Z44l4j6J5PKBB3Ip1RpPwnDxyUD5MwvnACcQM1cljaP5ST2ahySR8Fxjn8/tpt8L1uJA2XQo2DK6NSSxkVk8ESat6YmqLYiwiWFhJ43OCJy0sBHM5hRvCJWMNaOhKKphC1Bea5xScupnF9R60J92Z187eGz5qofiCUxgbN4SEayT8gWfY1hAY2bSbQNGLEYDkG+akoa5gPa96tAuJZig7ZlkBsM4uaUqmtA08yfUGTrNQTOK4enGImG2OAu7k/hQ2xXUMy5XbwkW6qxyf+iKSnfDUva1Wl3Buq1cwlWn5iQXxMItkJv/wsX8Mi3d5pEFKTSTP3q/pOdks7+G0hAhtJ4hvX16mf4Oxc/7abgzARvAKGzOM/W3WJwmyRNGNAwJuR5uNmn5xk4TxG3jDCBRF3MLOCSVg6xewJIJL+dxncksUbZhBj9y4rXlka9AoJDbX8DqRvHsgNIKrWObZyTXwBWWNUhvHNH+weIqrEhzUAonNDjwWsnp14+tXFsdQhGAzb2IRca8hmZ+v+MLjdRLASbQKoGPFfHUcnRakXnhDN0k5F7DQ55OUKLbmbto30LakgHWczDpfvJ+FYjsezs2f1nzSyygsyvkrGyjNOxxoVrDAwMQFTegsyQHtabySxNIWNezNzXFB3jJaD/YCJJ/xPjY1KTV6G8UmnsNO2jacGK4gubEUK43QtFUTBCyNxY9cRLnPMJTYHMAVDeZ410SYxzhD4m0LmxH8BY2VLbdFoBlBluATzufHemA3K8VdRt2kWFoQ5e8MoTRhty1EcTKv8NQWlMhvONuikCylD5G0rgZJjHWU0zYJsDSlnMDsAAV0lxtNws5NMhxEIXmFW7jKmETyHL7k0QYat3M6PogJPi1WoriEL3kmW25rToDlEOixuOKa/763BArM5ENG+opoXMU7rNsCorIEmkIOoggNjGK/jKCjKKG1QX8cSmfWpJ2xQPOrb20F0ItCqpsctZzt8Rb2YiSxJMkWaFrxN+Yzp0HCWDQCwdXsxQGGkRRxO9/xTXYjaU6AVbfbaJpn00hiPM3vsBJi0iSwI8dzzxYQkyXQbM8Q9/91pGPWPe3MEJ5JO2OBZqmPW5w0AKVNNMGMpIyL6cdAj8dKoOjBrRyTNmotvzpWGefxMn080Y8SRU+mcTwbsptgc2uq2cJVbfuUtQaaHENJTkf9Ddf2o7cLvyrpfDj1ow0hJ4WMoCDtjJ1ah8LwaSd6NOEt6XsuZZMhzEZxANdQ1EAxcwrJ10yi3KejShTDuZKCbHKPtpT5am46FizmU58QCgaxe5M/K5QoijkK3Cp7iRFo6R6/iGrgEPqknbEGVrDZd86rgf5Ndn0VkpeZZoBfieZM/txg25JC8izT3YhEr5Uz1q1ELcKyQEtrXoAl2My3hs/buVddmrZBCAPZA+fkq4zygE+Zz4Bz0h8fRDpvpgaW8Lkxn9S+jZ7yOx1QKG7iWeO4C7jGTXrYMNxmcyOvGO4yaoqYyt7hwTPSIsPNsK3xia9CsJ3776ZrMitgFF3QxLiRlwPGuAli9OGOpJBFgU2E3/OoITN/XbPYzDwO9CR+1AiGM6lJa6KVXMIO7OjzZNl04C5GNdCFaI3FBi5hIP0NnqytuY0jWRWO41oAqwWwarWJ7Simsgl7sZyzrqGA4BceZHGI385hJKd7rujAIHZjdlp/kM18SDqicLSz7vTwhQo3JWCXLOJiXqDYAxQWit9wB8fTMJk6bATfcSkPU+qDLM2+3MA54dJNt5iEzbGtJmoApm60auIGoWBPhqDQbjH6oDdbCxC84QJPIvx145AM4gbvssLgxerMYYhGuQAdFLIs3uQKg1kosTmGKQ1oFkqe5Vajgao4lbPCReC3AFZzbOVUenY1AXSgmKYc767RDKMQgeAtooikm6PpHhvNx3xl2MkPpWOapEMai/n84KNVDMmQvOsn+aW8jeRWHjMEbkgUUzmiAS+9S27hFd9VHWe+V7J3mOTlLYDlkK550cH2MbEGqhqpFkxQ6mtacwIgmMcswgT/KiS/8rHhL/u5LvxUbwR4zvcNp/7ONnkWeV0PlL2Ir33XkAVQyD1s30BalkJQzjh+8fnNJJrOPEqX4M73FsByWEU1q/lGjL7L1VQ2YepLBAcyAICZoZP2CAQveu7ZCTSSUa5IpRI2eNpHF0mMrRmWR63IyUJXlHegWMuZrPXpNhJFD+4NdAE8Pxuk4GfOpcb3NoliAHcHp2QLYIGgFTs0yZQh9dVKKfGwiAAWNxJgtaV/gMMfgeYPgKaKD0LfVrDRzGSBQaRH0jOtUQjLeMyXhFmgOZVCt8Jj7nClOJKZ7Jhnw1ARYTaXGmhlYTOU693EQw2xKVm8wjWGZNYCm2O4HEUkyEhaAEugGcPTdGhG1OjicSM7//1jI1QIFsB4rqUgg6hKbPowFIHghyxz31bzksfwkij6clBGCXmUMs+ZmgXsz9A8aVeKntzIVoar1rm2GIIHeMAQxGChOI/T8gS5QcDT4haeNxioApspHBnMwG7ugOVctLiAGjZDs7m008kICN83OD9INDtyHmsyhlNI4Ah6EwX+x6os1koCT1PtMwqLGOWWu0+lGwj+x+uG1HiaiXkQdoGmmOvZnhX1puFO4UPD+AURrmXvBkvtp6nhPL725ddw0ozfyU5BwLMFsDRnsAtzG8kcagyPkfDdhNPAIr5oYMgWgGQSnVjiglfqb8Yo4QQEkiivZcW3GsFCPkAnCa5EM4zt0/5OYjOdjb7gBsFQjkLnJO7OhZnxnIRmAzVZr2l6Y2wtF/CrYfyK7txCtwbSshSS5ZxnuOfo6Jh30Dbz5TDZoAwqUrBtYzULxV5MABbnWJl5SzlnFEAX9jT85T1+qufqPv6xKI7ieFTGe/tOBNb+xLBYzJdZcY3GooJXPFwo0HTNGI0l+ITHPEahQFHABNrmkMnTMYdOcAu6L6Iqy36KMo7/c670hbI4cD2Y63wezexbej+UQvJfLnXLqHh54WD+ltE1kILU+YcWARS4RRaTP42E7id/BoliK26gMzGWZdjjM/fVEDFMIg9zFuzguTWogQoeb2DolCj6cxOtqGJZRi1BM9H9xsf8YgxCDKaHvMEyz5mZQHMyhRnWPsY05ns4RKDYj/Pd7E/Z0uBg7nEDdhehs4w+L8pIP8k/udtwDVmgOYUzs5qD6fuFGeRZI7mfB5GerCkCgeJcTst0bilTfFof+oJlVJ4jIZc4v+bRdRyEQrEmRziQFDSITiJz/L1Gc7jnwoZG8iLvEiSySeRtJooi7mYbNCtYktHTtR+/c2f/DTEiWYm1jcUPfIY/Jd8uDEpLW43gJ66mMolGjoifx4FZ6qURbPbnYdpjI7FZUY9bnibKdbxtvIZsMYWheQpwyAR7GohxFR8ZDFSB5Ar2Tz8SmQJaZIrv5uLjKKbUsCRFIQmSP9FXTOE8FJKa7JKJJTFfmwYwd511yb5XiWIgf0xaR6dowA2BNoN8FaKVCAqYwXBsBGvSOtGdYmXjKcBGUsFX5JYv9iliSRunwKaYMRnnJniauzw6ikDTnWn0CJ2YRyCJsQ//pLdrUkZZGWhtRQp66oyazXomscQHFBKbrtxJr9CQZQVWSrxm4UrGs9yYsasXd6SnpkwBLUUG0uRSUsHxnRQZ3HulIWCwOIUeI0MLDCjG81diaOBXlucgBgJoRTcDxVqRv2TMAihKAe8iYA8amJiUtcDJn3Q5X/mCC02tdUqNPKznUHEbp7rcsJ51aXjAwuageFLn5fyQA01t4FnjefAwuqT1RTkm0zW86DMoFYO4kzahztqc7fIgnqIfyhXcqKGkmPdXtstTwrddlmbkAoXkc6YYPFkWmp24ncJQm2Ern4PHMQmLA4xEMJvLqDTkyVIM4gaKU/OUNDJ/a2MYZSva5bS/t8ZU5LtziB7bpwCsaKiTGguF5nJujVfvWMqaHLXHTj6KCaA9Iq8nMKVGJtGB9neJQHExpyXd3IoS4V5mBIArDXQkYuSAMG7nCDbF3M95KJf6m41XsesAoYSp8SLsm3PWhSt9V3Qsogzg0AxUVEAZY/nQcztPYnMUtxMJfCNOAjbH8xS9E36zIcDMFK1obYSJrgEkUyH5F3caPIBO8OYEdLDgTZe3i4zIURqQBo8Zo8MEijGcE0bbsxCMosxTblqhWcfeWXtRJDDVU2TbecNzAXsQCI6g0lMe20axiF3jpkN6G1q44+/IvfFZKTT/wsoBigWCo3yluWNovqZr3vxuEjiOCs/8FZoFbOsCkjAk9BXxWcMlbjFcnVCw/nlEQFNEcIavCLmN5gt6JLxfpDXtAAbwenwWNprb07xfApPiJXw1c2mb06YpEFzqm0UMzSsUZPTASKAfc1y+S6bCP2kTYK2dlShgPFXue2t//wGdM/zeQrAbqw2SWc3RiEC3BQSlvJ/w5sRyuxUcD4EKcEkEQ9nsk0XNJg4OhBESQRc+MRS1VyjWMjqo3Dgvu904Jc1UyMq5LBAUuAvtFeyNbB1oihYww0Oi2nH9yGjfLPxPbTuM2Qksp9DckROsRIB/+UamiGFzeJYUM6/LA8YF1syJl2VInH2y+O3BEwlwpdz1vZ/igOdDEnjZQH+N5jMGZ6C/iOsCp7M4PguFJsaZKSHIAoZTlrBSv7BDTkcPEpiYQkyGBuACCfTkrbiA6gRqvuYmTjYfWYn459vyb8/vbTRPGN0wyXoUTDBIZgzNwwFdNhawAz8bKGCjWcfhBDnaKQBuMPBCDM1NgUEP9uTnFBK9nOFBRiKJALuzxN19vRP6hm0goNqY2KsEzjAyex1cWBnHtYdxerV7zFv8mb3okLafDozk8aS9zfn11SlciEHmFgEGs8FQJN5h4sKAC5j+LRYwmGWGtzgzKOefHMO2BlO+Ff05hn+wMQ7StWC1gQkBtStnlsPZZKS/jaaMFziZ3dkqJR0FvRnD+3HK1I58MyOMY3CyTe3Dwvg7HS3rfKAwK3rW5q96J4WQfIAVELJacTe2R8+KovmRP7nbk5Orq06/reWAUs5yAdurm9wJafXTCNCVL+Orl2xlrGMfoCCQbgPHETOoDjaacs6Ma3PpRjKQHwwYoVD8zG+ASMCRnEqNhxa1I1nNH0wjEQn/dmzbnbmX/QxnJhoQvMq5LI3/TmdkkdpvHcn9dDQwpuNuvIw7qXH/qlP0MJAHjeNK9KFoZvEzq9nEWjZS7SZMAUkJvenNHuztOl+tJFfs6fwjdImrOooN4jEGGJ2uGsE9XMZGsi0vVveWPbiX32aY/zK+YDnrKaeCAoopoR092JXu7jyle14EMd7mej4gU97JuvfvzSMMTPH+WnpW8SlLWZNAfxuI0I7e9GEfN9dCostfsJqD+do3Cse7cSh/ZzvP9xdwInMC8p9/FqVMZqrLy/61msZl8YwCOo2WYgOnchV943JRN6/neIj/ssnwuy6M4DSGuSshPP6xa7nayIN1Y+/BfRxmXAGF5EtO5Qtqowl1WqBQXMtUg+dRuVH9N8RPLLVxJP24j0OMnkuN4EPOYV6AkTjwPJ2xHnmsHUkFt3Mr69LJTi/G8kMKtb92H/qck+kSSuh24QY2puxVobF5jAONDmWn9eAsvk0xJp2w+3o/raHKfZK/mfz21eyftV+kPxNZbjR16/r/D6OMQQ/B29acz4I065Jq/nW6XoxY/O9VzORPtA5hBvdlPEtDv1+59K9J+S0bzRJ6GKlfwgRWGwxtzfccl4ZX0h3ZjOZVHwfoJI/eg+wU0MUBA5jBhvhvVbznSj5iMgczgI6U0obO7MIormcuts+HWMc3E0kXk9iZk/gsg2QuZSLbBHQvFPGiwbis7f8zjjM69wG6cQbzMozkB8bSK5DlINiKd43y4/T/HqOTrQYR98PsyQgOZzci1KRhZEUhVczmJd7im4wnS1uxL4fye/qi0pyWaQQR1vAmrzOTXz3W8q6MYDR7UJh2XHXnZbVYnOyEVthG74ITEjiSn0LHGJfwW4ZzNAOwMlJsM+/xCu+wMLSQFbjrsmuGdamdTWL8sI4XwqobywI+5nVeZ3NcU8h0eD2I3zGanQK+v/ZJdME7QmqivqMZDGe9j/qDuYjRxjXXFFDGizzJTMoCexl35SBGsB+t05xIaqCABTzDf5iV8W6phY1kKGcwkvaAkxlBxjXtctaykE1oOtGfdq7YKTeSSydQw+ZbPmIGXxgLQwh+w8GMZh+KqU6TDEZRiM08XuQtZmeoSy1R9OYNdjTSV1NIOW/xLO8k5Y+I8BtGMJpBFKXhBef3Mb7gZd5kTgYeE2h24VV6G9bF6amM13iOd+rqEEjgGGZ7zu8yP+v5kAEpNRMJnJdBKzI9S5junrZYwMHMoSx0H2GfhcZS5ukNjGOZa9if0j+reMpoFqd2j/6R2Qn6SXaPopw1LOI9rudEBibsbZmPEo7lS6rrmfrPe0IlLGBaIG78iiMz+h4lMJpZVIQaU4xvuCmjr9Zyt5Sh3Ma3blSRJkaUGoPGEKMmSc/VbGQJb3ElR6fQi5wa0++zOSRFY3zG6Ax8ZgEHUZ6hp1+4j7but3/DrNAjifI/RmXQ5CVwbEoLpfZZxJ2Ozhdxf7SEH10szCxO2t27S11W0ymIbTGPOR5NjjS7mwZKqHI9Lc7tw5/52uhxyF8TfG+oTptprBaLmOdSItjcBEVUhjzfKmBpiHXxvjVGNev4hZWsYBWr2ZiwFirQLCP84BZdrR/6O5eCYj4eivEslWkcv46GUhzg7oUGJEtZEL/cnvnqCAhKsJCGkSV77gQQ5T3e43b25FC2Ywc6p4SIWmhdwDJW8C2zWMyvRm9XIt8s53migddAux5blYEyNoKZ/JkRKSwf590lrErYwJYwHxWYFxz+yXyPRSF4hrHsn0Jrc6S/FasdH9qWUJq8peULmr1XTpvyWLec3GR1LuH29GMnetGT7nSnM22RKDaznrWsYRWrWM2v/MRKyuKmkhPQq5s1jUOMpAWwtizhCDuz2n90xrOjFurnMgev1ioppogIIm4k1hh+kxmqsqVOsN9lLqbaUKsTeCQiJ+AKFtaQS68Nk286WzCo/3eJRplbQ9Jf5/BW3UTXSqf5ey0ENI2xi3qXxTyPpEXDamktrf702/xsGy0t3v4PXqFmxnIONvEAAAAASUVORK5CYII=";
const PUNTOS = [
  {k:"etiqueta",   e:"🏷️", l:"Prendas con etiqueta",                 inf:"Prendas sin etiqueta"},
  {k:"estanterias",e:"👕", l:"Estanterías sin ropa detrás",          inf:"Ropa detrás de estanterías"},
  {k:"pedidos",    e:"📦", l:"Pedidos retirados a tiempo",           inf:"Pedidos sin retirar"},
  {k:"aviso",      e:"📢", l:"Palermo avisa pedidos pendientes",     inf:"Pedidos no avisados por Palermo"},
  {k:"limpieza",   e:"🧹", l:"Limpieza",                             inf:"Desorden / limpieza"},
  {k:"deposito",   e:"🏭", l:"Depósito ordenado (todo en su lugar)", inf:"Depósito: cosas fuera de lugar"},
  {k:"otros",      e:"⚠️", l:"Otros",                                inf:"Otros"}
];
const ETIQ = {1:"Muy mal",2:"Mal",3:"Regular",4:"Bien",5:"Excelente"};
const EMO  = {1:"❌",2:"🔴",3:"🟡",4:"🟢",5:"⭐"};
const REMO = {Excelente:"✅",Advertencia:"⚠️",Reclamo:"❌"};
const DEF = { promExc:4.5, promAdv:3, maxInf:3, diasMax:7, mExc:"", mAdv:"", mRec:"" };
const LIBS = {
  xlsx:[["https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js","sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz"]],
  pdf:[["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js","sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk"],["https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js","sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3"]]
};
const IDLE_MS = 10*60*1000, HIDDEN_MS = 2*60*1000;

const $ = id => document.getElementById(id);
const S = { token:null, rol:null, jt:null, params:{...DEF}, view:"auditar", lista:[], form:null, fotos:[], openRow:null, fotoCache:{} };

/* ---------- Servidor ---------- */
const BACKEND = String((window.HB_CONFIG||{}).BACKEND_URL||"").trim();
const BACKEND_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(BACKEND);
async function api(fn, ...args){
  if (!BACKEND_OK) throw new Error("La app todavía no está conectada al servidor.");
  let r;
  try{ r = await fetch(BACKEND, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({fn,args}), redirect:"follow", credentials:"omit", cache:"no-store"}); }
  catch(e){ throw new Error("Sin conexión. Revisá internet y probá de nuevo."); }
  let j; try{ j = await r.json(); }catch(e){ throw new Error("El servidor no respondió bien. Probá de nuevo en un momento."); }
  if (!j || !j.ok) throw new Error((j && j.error) || "Error del servidor.");
  return j.data;
}
const esAuth = e => /AUTH/.test(e && e.message);
const msgErr = e => esAuth(e) ? "La sesión venció. Volvé a ingresar la clave." : (e && e.message ? e.message.replace(/^Exception:\s*/,"") : "Error inesperado.");

function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==="class") e.className=v; else if (k==="text") e.textContent=v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v===true?"":v);
  }
  for (const c of kids.flat()) if (c!=null && c!==false) e.append(c.nodeType?c:document.createTextNode(String(c)));
  return e;
}
const toast = t => { const x=$("toast"); x.textContent=t; x.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>x.hidden=true,3200); };
const hoy = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const fmtF = s => s ? s.split("-").reverse().join("/") : "";
const fmt1 = n => (n==null||isNaN(n)) ? "–" : Number(n).toFixed(1).replace(".",",");
const pct = n => isNaN(n) ? "–" : Math.round(n*100)+"%";
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const ssGet = k => { try { return sessionStorage.getItem(k); } catch(e){ return null; } };
const ssSet = (k,v) => { try { v==null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v); } catch(e){} };

function resAud(prom, p=S.params){ if (prom==null) return null; return prom>=p.promExc?"Excelente":prom>=p.promAdv?"Advertencia":"Reclamo"; }
function resChk(tot, p=S.params){ return tot===0?"Excelente":tot<=p.maxInf?"Advertencia":"Reclamo"; }
const cls = r => r==="Excelente"?"ok":r==="Advertencia"?"warn":r==="Reclamo"?"bad":"";
const scChip = v => el("span",{class:"sc",style:v?`background:var(--s${v}bg);color:var(--s${v})`:null,text:v??"–"});

/* ---------- Portón ---------- */
async function iniciarGate(){
  const t=ssGet("hb_t"), r=ssGet("hb_r");
  if (t && r){ S.token=t; S.rol=r; abrirApp(); api("getParams").then(p=>{S.params={...DEF,...p}; onChange();}).catch(()=>{}); return; }
  try{
    if (!BACKEND_OK){ $("g-title").textContent="App instalada · falta conectar el servidor"; $("g-lead").textContent="La app ya está en este teléfono. Cuando se active el servidor de Hey Blackk, se conecta sola: no hace falta reinstalarla."; return; }
    const st = await api("estado");
    if (!st.configurado){
      $("g-title").textContent="Configurá las claves"; $("g-lead").textContent="Es la primera vez. Ingresá el código de instalación del servidor y creá una clave para jefes y otra para auditores. No las compartas por chat ni por mail."; $("g-setup").hidden=false;
    } else {
      $("g-title").textContent="Ingresá tu clave"; $("g-lead").textContent="Auditores: clave de auditor. Jefes: clave de jefes.";
      $("g-login").hidden=false; setTimeout(()=>$("g-pw").focus(),50);
    }
  }catch(e){ $("g-title").textContent="Sin conexión"; $("g-lead").textContent=msgErr(e)+" Recargá la página para reintentar."; }
}
$("g-login").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("g-err"), b=$("g-btn"); err.hidden=true; b.disabled=true; b.innerHTML='<span class="spin"></span> Verificando…';
  try{
    const r = await api("login", $("g-pw").value, "app");
    S.token=r.token; S.rol=r.rol; S.params={...DEF,...r.params}; ssSet("hb_t",r.token); ssSet("hb_r",r.rol);
    $("g-pw").value=""; abrirApp();
  }catch(x){ err.textContent=msgErr(x); err.hidden=false; }
  finally{ b.disabled=false; b.textContent="🔓 Entrar"; }
});
$("g-setup").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("s-err"), b=$("s-btn"); err.hidden=true;
  const j=$("s-j1").value, a=$("s-a1").value, code=$("s-code").value.trim();
  if (!code){ err.textContent="Ingresá el código de instalación."; err.hidden=false; return; }
  if (j.length<6||a.length<6){ err.textContent="Cada clave tiene que tener al menos 6 caracteres."; err.hidden=false; return; }
  if (j!==$("s-j2").value||a!==$("s-a2").value){ err.textContent="Las claves repetidas no coinciden."; err.hidden=false; return; }
  b.disabled=true; b.innerHTML='<span class="spin"></span> Creando…';
  try{ await api("configurar", code, j, a); ["s-code","s-j1","s-j2","s-a1","s-a2"].forEach(i=>$(i).value=""); $("g-setup").hidden=true;
    $("g-title").textContent="¡Listo! Claves creadas"; $("g-lead").textContent="Ahora ingresá con la clave de jefes o de auditor."; $("g-login").hidden=false; }
  catch(x){ err.textContent=msgErr(x); err.hidden=false; }
  finally{ b.disabled=false; b.textContent="🔐 Crear claves"; }
});
function abrirApp(){ $("gate").hidden=true; $("who").textContent = S.rol==="jefe"?"👔 Jefes":"📝 Auditor"; onChange(); renderMine(); }
function salir(){ api("logout",S.token).catch(()=>{}); if (S.jt) api("logout",S.jt).catch(()=>{}); S.token=S.jt=S.rol=null; ssSet("hb_t",null); ssSet("hb_r",null);
  clearLock(); show("auditar"); $("gate").hidden=false; $("g-setup").hidden=true; $("g-login").hidden=false; $("g-title").textContent="Ingresá tu clave"; $("g-lead").textContent="Auditores: clave de auditor. Jefes: clave de jefes."; }
$("btn-salir").addEventListener("click",salir);
function sesionVencida(){ toast("La sesión venció. Volvé a ingresar la clave."); salir(); }

/* ---------- Formulario ---------- */
function blankForm(){ const f={puntajes:{},coment:{},inf:{}}; PUNTOS.forEach(p=>{f.inf[p.k]=0;}); return f; }
function buildPuntos(){
  const box=$("puntos"); box.textContent="";
  PUNTOS.forEach((p,i)=>{
    const card = el("div",{class:"punto","data-s":S.form.puntajes[p.k]||null});
    const sc = el("div",{class:"score",role:"group","aria-label":"Puntaje "+p.l});
    for (let v=1; v<=5; v++) sc.append(el("button",{type:"button","data-v":v,"aria-pressed":S.form.puntajes[p.k]===v?"true":"false",
      onclick:()=>{ S.form.puntajes[p.k]=v; card.setAttribute("data-s",v); [...sc.children].forEach(b=>b.setAttribute("aria-pressed", b.dataset.v==v?"true":"false")); onChange(); }},
      el("span",{class:"n",text:EMO[v]+" "+v}), el("span",{class:"t",text:ETIQ[v]})));
    const com = el("input",{type:"text",maxlength:"200",placeholder:"💬 Comentario (opcional)",value:S.form.coment[p.k]||"","aria-label":"Comentario "+p.l, oninput:e=>{S.form.coment[p.k]=e.target.value; saveDraft();}});
    const num = el("input",{type:"number",min:"0",max:"999",inputmode:"numeric",value:S.form.inf[p.k]||0,"aria-label":"Infracciones "+p.inf, oninput:e=>{S.form.inf[p.k]=Math.max(0,parseInt(e.target.value)||0); onChange();}});
    const step = d => { num.value = Math.max(0,(parseInt(num.value)||0)+d); num.dispatchEvent(new Event("input")); };
    card.append(
      el("div",{class:"punto-head"}, el("b",{}, el("span",{class:"em",text:p.e}), p.l), el("span",{class:"idx",text:(i+1)+"/7"})), sc,
      el("div",{class:"punto-extra"}, com, el("div",{class:"inf"}, el("div",{class:"stepper"}, el("button",{type:"button","aria-label":"Restar",onclick:()=>step(-1),text:"−"}), num, el("button",{type:"button","aria-label":"Sumar",onclick:()=>step(1),text:"+"})), el("span",{text:"Infracciones"}))));
    box.append(card);
  });
}
function calc(f=S.form){
  const vals = PUNTOS.map(p=>f.puntajes[p.k]).filter(v=>v);
  const prom = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  const tot = PUNTOS.reduce((a,p)=>a+(f.inf[p.k]||0),0);
  return {n:vals.length, prom, tot, completo: vals.length===PUNTOS.length};
}
function onChange(){
  const c = calc();
  $("r-prom").firstChild.textContent = c.prom==null?"–":fmt1(c.prom);
  const r = c.completo ? resAud(c.prom) : null;
  $("resultbar").setAttribute("data-r", r||"");
  $("r-label").textContent = r ? REMO[r]+" "+r : "⏳ Falta completar";
  const ip=$("r-inf"); ip.hidden = c.tot===0 && !c.completo; const rc=resChk(c.tot); ip.className="pill "+cls(rc); ip.textContent="Checklist: "+c.tot+" infracc. · "+rc;
  $("r-meter").style.width = (c.n/PUNTOS.length*100)+"%";
  $("r-count").textContent = c.n+" de "+PUNTOS.length;
  const okName = $("f-auditor").value.trim();
  $("btn-enviar").disabled = !(c.completo && S.token && okName);
  $("btn-enviar").title = !okName ? "Completá el nombre del auditor" : !c.completo ? "Faltan puntos por evaluar" : "";
  saveDraft();
}
function saveDraft(){ lsSet("hb_draft",{form:S.form,auditor:$("f-auditor").value,fecha:$("f-fecha").value,dias:$("f-dias").value,gen:$("f-general").value}); }
function resetForm(){ S.form=blankForm(); S.fotos=[]; $("f-dias").value=""; $("f-general").value=""; $("f-fecha").value=hoy(); buildPuntos(); renderFotos(); onChange(); }
function mensaje(rec){
  const p=S.params;
  let m = `Equipo Palermo: auditoría del ${fmtF(rec.fecha)} realizada por ${rec.auditor}. Puntaje promedio: ${fmt1(rec.promedio)} de 5. `;
  m += (rec.resultado==="Excelente"?p.mExc:rec.resultado==="Advertencia"?p.mAdv:p.mRec)||"";
  const flojos = PUNTOS.filter(x=>rec.puntajes[x.k]<=2).map(x=>`${x.l} (${rec.puntajes[x.k]})`);
  if (flojos.length) m += `\nPuntos a corregir: ${flojos.join(", ")}.`;
  const infs = PUNTOS.filter(x=>rec.infracciones[x.k]>0).map(x=>`${x.inf.toLowerCase()}: ${rec.infracciones[x.k]}`);
  if (infs.length) m += `\nSe detectaron ${rec.totalInfracciones} infracciones (${infs.join(", ")}).`;
  if (rec.diasPedido!=null && rec.diasPedido>p.diasMax) m += `\nHay un pedido con ${rec.diasPedido} días sin retirar (límite ${p.diasMax}): avisar y gestionar hoy.`;
  if (rec.comentarioGeneral) m += `\nComentario: ${rec.comentarioGeneral}`;
  return m;
}
async function enviar(){
  const c=calc(); if (!c.completo || !S.token) return;
  const btn=$("btn-enviar"); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Enviando…';
  const data = { fecha:$("f-fecha").value||hoy(), auditor:$("f-auditor").value.trim(), puntajes:{...S.form.puntajes}, infracciones:{...S.form.inf},
    comentarios:{...S.form.coment}, diasPedido:$("f-dias").value, comentarioGeneral:$("f-general").value };
  try {
    const rec = await api("guardarAuditoria", S.token, data, S.fotos.map(f=>f.data));
    const msg = mensaje(rec);
    $("sent-em").textContent = REMO[rec.resultado];
    $("sent-lead").textContent = `${fmtF(rec.fecha)} · ${rec.auditor} · ${fmt1(rec.promedio)} / 5 · ${rec.resultado}`;
    $("sent-msg").textContent = msg; $("sent").hidden=false;
    const mine = lsGet("hb_mine")||[]; mine.unshift({fecha:rec.fecha,auditor:rec.auditor,promedio:rec.promedio,resultado:rec.resultado}); lsSet("hb_mine",mine.slice(0,8));
    try{ localStorage.removeItem("hb_draft"); }catch(e){}
    resetForm(); renderMine(); $("sent").scrollIntoView({behavior:"smooth",block:"start"});
    toast("✅ Auditoría registrada");
  } catch(e){ if (esAuth(e)) return sesionVencida(); toast("No se pudo enviar: "+msgErr(e)+" El borrador quedó guardado."); }
  finally { btn.textContent="✔ Validar y enviar"; onChange(); }
}
function renderMine(){
  const mine=lsGet("hb_mine")||[], box=$("mine"); box.textContent=""; $("mine-card").hidden=!mine.length;
  mine.forEach(r=>box.append(el("div",{class:"row",style:"padding:8px 0;border-top:1px solid var(--line)"},
    el("span",{class:"mono",style:"font-size:13px",text:fmtF(r.fecha)}), el("span",{text:r.auditor}), el("span",{class:"spacer"}),
    el("b",{class:"mono",text:fmt1(r.promedio)}), el("span",{class:"pill "+cls(r.resultado),text:REMO[r.resultado]+" "+r.resultado}))));
}

/* ---------- Fotos ---------- */
function renderFotos(){
  const box=$("fotos"); box.textContent="";
  S.fotos.forEach((f,i)=>box.append(el("div",{class:"foto"}, el("img",{src:f.data,alt:"Evidencia "+(i+1)}),
    el("button",{type:"button","aria-label":"Quitar foto",text:"×",onclick:()=>{S.fotos.splice(i,1);renderFotos();}}))));
  if (S.fotos.length<4) box.append(el("label",{class:"addfoto",for:"f-foto",tabindex:"0",text:"📷 Agregar"}));
}
async function aDataURL(file){
  let img=null;
  if (window.createImageBitmap) img = await createImageBitmap(file).catch(()=>null);
  if (!img) img = await new Promise(res=>{ const u=URL.createObjectURL(file), i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=u; });
  if (!img || !img.width) throw new Error("formato");
  const max=1280, k=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.8);
}
$("f-foto").addEventListener("change", async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{ S.fotos.push({data: await aDataURL(f)}); renderFotos(); }catch(x){ toast("No se pudo leer la foto. Probá con otra."); } });

/* ---------- Secciones protegidas ---------- */
let idleT=null, hidT=null;
function bumpIdle(){ if (!S.jt) return; clearTimeout(idleT); idleT=setTimeout(()=>lock("🔒 Sección bloqueada por inactividad"), IDLE_MS); }
["pointerdown","keydown","scroll"].forEach(ev=>addEventListener(ev,bumpIdle,{passive:true}));
document.addEventListener("visibilitychange",()=>{ clearTimeout(hidT); if (document.hidden && S.jt) hidT=setTimeout(()=>lock("🔒 Sección bloqueada"), HIDDEN_MS); });
function clearLock(){
  if (S.jt) api("logout",S.jt).catch(()=>{});
  S.jt=null; S.jtView=null; S.lista=[]; S.fotoCache={}; clearTimeout(idleT);
  $("reg-body").textContent=""; $("kpi-body").textContent=""; vacReset();
  ["pw-cur","pw-new","pw-new2","lk-p1"].forEach(i=>$(i).value="");
}
function lock(motivo){ clearLock(); if (S.view!=="auditar") show(S.view); if (motivo) toast(motivo); }
$("lk-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("lk-err"), b=$("lk-btn"); err.hidden=true; b.disabled=true; b.innerHTML='<span class="spin"></span> Verificando…';
  try{
    const r = await api("login", $("lk-p1").value, "seccion");
    S.jt=r.token; S.jtView=S.view; S.params={...DEF,...r.params}; $("lk-p1").value=""; bumpIdle();
    if (S.view!=="ajustes") await cargarRegistro();
    show(S.view);
  }catch(x){ err.textContent=msgErr(x); err.hidden=false; }
  finally{ b.disabled=false; b.textContent="🔓 Desbloquear"; }
});
async function cargarRegistro(){
  const r = await api("getRegistro", S.jt);
  S.lista = (r.lista||[]).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")||(b.creado||"").localeCompare(a.creado||""));
  S.params={...DEF,...r.params};
}
$("reg-refresh").addEventListener("click", async ()=>{ try{ await cargarRegistro(); renderRegistro(); toast("Registro actualizado"); }catch(e){ esAuth(e)?lock("La sesión venció."):toast(msgErr(e)); } });

async function show(v){
  if (S.jt && v!==S.jtView) clearLock();
  S.view=v;
  document.querySelectorAll(".tab[data-view]").forEach(t=>t.setAttribute("aria-selected", t.dataset.view===v?"true":"false"));
  ["auditar","registro","kpi","ajustes","locked"].forEach(x=>$("v-"+x).hidden=true);
  if (v==="auditar"){ $("v-auditar").hidden=false; return; }
  if (S.jt){ $("v-"+v).hidden=false; if(v==="registro")renderRegistro(); if(v==="kpi")renderKPI(); if(v==="ajustes")fillAjustes(); return; }
  $("v-locked").hidden=false; $("lk-err").hidden=true;
  $("lk-title").textContent = v==="registro"?"🗂️ Registro protegido":v==="kpi"?"📊 KPI protegidos":"⚙️ Ajustes protegidos";
  setTimeout(()=>$("lk-p1").focus(),50);
}

/* ---------- Registro ---------- */
function filtReg(){
  const d=$("rf-desde").value, h=$("rf-hasta").value, r=$("rf-res").value, q=$("rf-q").value.trim().toLowerCase();
  return S.lista.filter(a=>(!d||a.fecha>=d)&&(!h||a.fecha<=h)&&(!r||a.resultado===r)&&
    (!q || (a.auditor||"").toLowerCase().includes(q) || (a.comentarioGeneral||"").toLowerCase().includes(q) || Object.values(a.comentarios||{}).some(c=>c.toLowerCase().includes(q))));
}
function renderRegistro(){
  const rows = filtReg(), tb=$("reg-body"); tb.textContent="";
  $("reg-lead").textContent = `${rows.length} auditoría${rows.length===1?"":"s"}`;
  if (!rows.length){ tb.append(el("tr",{},el("td",{colspan:"7",class:"empty",text: S.lista.length? "Ninguna auditoría coincide con los filtros." : "Todavía no hay auditorías. Las que se validen en Auditar aparecen acá (tocá ↻ Actualizar)."}))); return; }
  rows.forEach(a=>{
    const open=S.openRow===a.id, tog=()=>{S.openRow=open?null:a.id;renderRegistro();};
    tb.append(el("tr",{class:"clk",tabindex:"0","aria-expanded":open?"true":"false",onclick:tog,onkeydown:e=>{if(e.key==="Enter")tog();}},
      el("td",{class:"mono",text:fmtF(a.fecha)}), el("td",{text:a.auditor}), el("td",{class:"n"},el("b",{text:fmt1(a.promedio)})),
      el("td",{},el("span",{class:"pill "+cls(a.resultado),text:REMO[a.resultado]+" "+a.resultado})), el("td",{class:"n",text:a.totalInfracciones??0}),
      el("td",{},el("span",{class:"pill "+cls(a.resultadoChecklist),text:a.resultadoChecklist})),
      el("td",{class:"n",style:a.pedidoFueraDePlazo?"color:var(--bad);font-weight:700":null,text:a.diasPedido??"–"})));
    if (open) tb.append(el("tr",{class:"detail"},el("td",{colspan:"7"},detalle(a))));
  });
}
function detalle(a){
  const g = el("div",{class:"dgrid"});
  PUNTOS.forEach(p=>{ const v=a.puntajes?.[p.k];
    g.append(el("div",{}, scChip(v), el("div",{}, el("b",{text:p.e+" "+p.l}),
      (a.infracciones?.[p.k]>0)? el("div",{style:"color:var(--bad);font-size:12.5px",text:a.infracciones[p.k]+" infracciones"}):null,
      a.comentarios?.[p.k]? el("div",{style:"color:var(--muted);font-size:12.5px",text:a.comentarios[p.k]}):null))); });
  const box = el("div",{class:"dl"}, g);
  if (a.comentarioGeneral) box.append(el("div",{},el("b",{text:"💬 Comentario general: "}),a.comentarioGeneral));
  if (a.fotos?.length){ const f=el("div",{class:"fotos"}); a.fotos.forEach(id=>{ const slot=el("div",{class:"foto",style:"display:grid;place-items:center"},el("span",{class:"spin"})); f.append(slot);
      const put=src=>{ slot.textContent=""; slot.append(el("img",{src,alt:"Evidencia"})); };
      if (S.fotoCache[id]) put(S.fotoCache[id]); else api("getFoto",S.jt,id).then(src=>{ if(!/^data:image\/(jpeg|png|webp|gif);base64,/.test(src)) throw 0; S.fotoCache[id]=src; put(src);}).catch(()=>{ slot.textContent="Sin foto"; }); });
    box.append(f); }
  const msg = mensaje(a);
  const conf = el("span",{hidden:true}, el("span",{text:"¿Borrar esta auditoría? "}),
    el("button",{class:"btn sm danger",type:"button",onclick:async e=>{e.stopPropagation(); try{ await api("eliminarAuditoria",S.jt,a.id); S.lista=S.lista.filter(x=>x.id!==a.id); S.openRow=null; renderRegistro(); toast("Auditoría eliminada"); }catch(err){ esAuth(err)?lock("La sesión venció."):toast(msgErr(err)); }},text:"Sí, borrar"}),
    el("button",{class:"btn sm",type:"button",onclick:e=>{e.stopPropagation(); conf.hidden=true; del.hidden=false;},text:"Cancelar"}));
  const del = el("button",{class:"btn sm danger",type:"button",onclick:e=>{e.stopPropagation(); del.hidden=true; conf.hidden=false;},text:"🗑 Eliminar"});
  box.append(el("div",{class:"row"},
    el("button",{class:"btn sm",type:"button",onclick:e=>{e.stopPropagation(); copiar(msg,"Mensaje copiado");},text:"📋 Copiar mensaje"}),
    el("span",{class:"spacer"}), el("span",{class:"mono",style:"font-size:11px;color:var(--muted)",text:"Cargada "+new Date(a.creado).toLocaleString("es-AR")}), del, conf));
  return box;
}

/* ---------- Vaciar ---------- */
function vacReset(){ $("vac-form").hidden=true; $("vac-pw").value=""; $("vac-err").hidden=true; }
$("vac-open").addEventListener("click",()=>{ $("vac-n").textContent=S.lista.length; $("vac-ok").hidden=true; $("vac-form").hidden=false; });
$("vac-cancel").addEventListener("click",vacReset);
$("vac-form").addEventListener("submit",async e=>{
  e.preventDefault(); const err=$("vac-err"), b=$("vac-go"); err.hidden=true; b.disabled=true; b.innerHTML='<span class="spin"></span> Guardando respaldo…';
  try{
    const r = await api("vaciarRegistro", S.jt, $("vac-pw").value);
    vacReset(); S.lista=[]; renderRegistro();
    const ok=$("vac-ok"); ok.textContent=""; ok.append(`🧹 Se vaciaron ${r.borradas} auditorías. `);
    if (r.respaldo && /^https:\/\/docs\.google\.com\//.test(r.respaldo)) ok.append(el("a",{href:r.respaldo,target:"_blank",rel:"noopener",text:"Abrir el respaldo en Drive"}));
    ok.hidden=false;
  }catch(x){ if (esAuth(x)) return lock("La sesión venció."); err.textContent=msgErr(x); err.hidden=false; }
  finally{ b.disabled=false; b.textContent="Vaciar con respaldo"; }
});

/* ---------- Descargas ---------- */
const loaded = {};
function loadScript([src,sri]){ return loaded[src] || (loaded[src] = new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.integrity=sri; s.crossOrigin="anonymous"; s.referrerPolicy="no-referrer"; s.onload=res; s.onerror=()=>{delete loaded[src]; rej(new Error("load"));}; document.head.append(s); })); }
async function loadLibs(k){ for (const u of LIBS[k]) await loadScript(u); }
function guardar(filename, blob){
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=filename; a.rel="noopener"; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 60000); toast("⬇️ Descargando "+filename);
}
function rangoTxt(){ const d=$("rf-desde").value, h=$("rf-hasta").value, r=$("rf-res").value;
  return [d||h ? `Período: ${d?fmtF(d):"inicio"} al ${h?fmtF(h):"hoy"}` : "Período: todo", r?`Resultado: ${r}`:""].filter(Boolean).join(" · "); }
const HEXR = {Excelente:"FFDCFCE7",Advertencia:"FFFEF3C7",Reclamo:"FFFEE2E2"}, HEXRT = {Excelente:"FF15803D",Advertencia:"FFB45309",Reclamo:"FFC81E1E"};
const HEXS = {1:["FFFEE4E2","FFD92D20"],2:["FFFFE8D9","FFE8590C"],3:["FFFEF3C7","FFA16207"],4:["FFDCFCE7","FF16A34A"],5:["FFC9F2D9","FF0E7A3E"]};
const fill = argb => ({type:"pattern",pattern:"solid",fgColor:{argb}});
const toDate = s => { const [y,m,d]=(s||"").split("-").map(Number); return y?new Date(Date.UTC(y,m-1,d)):s; };
async function buildXLSX(list){
  const wb = new ExcelJS.Workbook(); wb.creator="Hey Blackk"; wb.created=new Date();
  const ws = wb.addWorksheet("Registro", {views:[{state:"frozen", ySplit:6}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0}});
  const logoId = wb.addImage({base64:LOGO, extension:"png"});
  ws.addImage(logoId, {tl:{col:0.15,row:0.2}, ext:{width:260,height:34}});
  ws.getRow(1).height=32;
  ws.getCell("A3").value="Registro de auditorías · Sucursal Palermo"; ws.getCell("A3").font={bold:true,size:14};
  ws.getCell("A4").value=`${rangoTxt()} · ${list.length} auditorías · generado ${new Date().toLocaleString("es-AR")}`; ws.getCell("A4").font={size:10,color:{argb:"FF5F5F68"}};
  const head=["Fecha","Auditor",...PUNTOS.map(p=>p.l),"Promedio","Resultado","Infracciones","Checklist","Días pedido","Comentario general"];
  const NP=PUNTOS.length;
  const hr = ws.getRow(6); hr.values=head; hr.height=44;
  hr.eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"},size:10}; c.fill=fill("FF111113"); c.alignment={vertical:"middle",horizontal:"center",wrapText:true}; });
  const asc=[...list].reverse();
  asc.forEach((a,i)=>{
    const r = ws.getRow(7+i);
    r.values=[toDate(a.fecha), a.auditor, ...PUNTOS.map(p=>a.puntajes?.[p.k]??null), a.promedio, a.resultado, a.totalInfracciones??0, a.resultadoChecklist, a.diasPedido, a.comentarioGeneral||""];
    r.getCell(1).numFmt="dd/mm/yyyy";
    PUNTOS.forEach((p,j)=>{ const v=a.puntajes?.[p.k], c=r.getCell(3+j); c.alignment={horizontal:"center"}; if (HEXS[v]) { c.fill=fill(HEXS[v][0]); c.font={bold:true,color:{argb:HEXS[v][1]}}; } });
    const pc=r.getCell(3+NP); pc.numFmt="0.0"; pc.font={bold:true}; pc.alignment={horizontal:"center"};
    [[4+NP,a.resultado],[6+NP,a.resultadoChecklist]].forEach(([col,res])=>{ const c=r.getCell(col); c.fill=fill(HEXR[res]||"FFECECF0"); c.font={bold:true,color:{argb:HEXRT[res]||"FF5F5F68"}}; c.alignment={horizontal:"center"}; });
    r.getCell(5+NP).alignment={horizontal:"center"};
    const dc=r.getCell(7+NP); dc.alignment={horizontal:"center"}; if (a.pedidoFueraDePlazo) dc.font={bold:true,color:{argb:"FFC81E1E"}};
    r.getCell(8+NP).alignment={wrapText:true,vertical:"top"};
    for (let k=1;k<=head.length;k++) r.getCell(k).border={bottom:{style:"thin",color:{argb:"FFE0E0E6"}}};
  });
  head.forEach((h,i)=>{ ws.getColumn(i+1).width = i===0?12 : i===1?20 : i<2+NP?14 : i===head.length-1?46 : 12; });
  ws.autoFilter = {from:{row:6,column:1}, to:{row:6+asc.length, column:head.length}};

  const wd = wb.addWorksheet("Detalle por punto", {views:[{state:"frozen", ySplit:1}]});
  wd.columns=[{header:"Fecha",key:"f",width:12},{header:"Auditor",key:"a",width:20},{header:"Punto",key:"p",width:36},{header:"Puntaje",key:"s",width:10},{header:"Infracciones",key:"i",width:13},{header:"Comentario",key:"c",width:50},{header:"Promedio auditoría",key:"pr",width:12},{header:"Resultado",key:"r",width:14}];
  wd.getRow(1).eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill("FF111113"); });
  asc.forEach(a=>PUNTOS.forEach(p=>{ const v=a.puntajes?.[p.k];
    const row=wd.addRow({f:toDate(a.fecha),a:a.auditor,p:p.l,s:v,i:a.infracciones?.[p.k]||0,c:a.comentarios?.[p.k]||"",pr:a.promedio,r:a.resultado});
    row.getCell("f").numFmt="dd/mm/yyyy"; row.getCell("pr").numFmt="0.0";
    if (HEXS[v]) { const c=row.getCell("s"); c.fill=fill(HEXS[v][0]); c.font={bold:true,color:{argb:HEXS[v][1]}}; c.alignment={horizontal:"center"}; }
    const rc=row.getCell("r"); if (HEXR[a.resultado]) { rc.fill=fill(HEXR[a.resultado]); rc.font={bold:true,color:{argb:HEXRT[a.resultado]}}; } }));
  wd.autoFilter={from:"A1",to:"H1"};

  const wr = wb.addWorksheet("Resumen");
  const n=list.length, prom=list.reduce((s,a)=>s+a.promedio,0)/n, tot=list.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const cnt=r=>list.filter(a=>a.resultado===r).length;
  wr.getColumn(1).width=42; wr.getColumn(2).width=14; wr.getColumn(3).width=14;
  wr.addRow(["Indicadores · Sucursal Palermo"]).font={bold:true,size:14}; wr.addRow([rangoTxt()]).font={size:10,color:{argb:"FF5F5F68"}}; wr.addRow([]);
  [["Auditorías",n],["Puntaje promedio",Math.round(prom*10)/10],["Total infracciones",tot],["Infracciones por visita",Math.round(tot/n*10)/10]].forEach(r=>{ const row=wr.addRow(r); row.getCell(1).font={bold:true}; });
  ["Excelente","Advertencia","Reclamo"].forEach(k=>{ const row=wr.addRow([k,cnt(k),cnt(k)/n]); row.getCell(3).numFmt="0%"; row.getCell(1).fill=fill(HEXR[k]); row.getCell(1).font={bold:true,color:{argb:HEXRT[k]}}; });
  wr.addRow([]); const h2=wr.addRow(["Promedio por punto","Promedio","Infracciones"]); h2.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill("FF111113");});
  PUNTOS.forEach(p=>{ const v=list.map(a=>a.puntajes?.[p.k]).filter(Boolean); const av=v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
    const row=wr.addRow([p.l, av==null?null:Math.round(av*10)/10, list.reduce((s,a)=>s+(a.infracciones?.[p.k]||0),0)]);
    const k=av==null?null:Math.max(1,Math.min(5,Math.round(av))); if (k){ const c=row.getCell(2); c.fill=fill(HEXS[k][0]); c.font={bold:true,color:{argb:HEXS[k][1]}}; } });
  return await wb.xlsx.writeBuffer();
}
function buildPDF(list){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.addImage(LOGO, "PNG", 14, 10, 62, 8.2);
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(20,20,22); doc.text("Registro de auditorías · Sucursal Palermo", 14, 27);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(95,95,104);
  doc.text(`${rangoTxt()} · ${list.length} auditorías · generado ${new Date().toLocaleString("es-AR")}`, 14, 32);
  const n=list.length, prom=list.reduce((s,a)=>s+a.promedio,0)/n, tot=list.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const cnt=r=>list.filter(a=>a.resultado===r).length;
  const RGB={Excelente:[[220,252,231],[21,128,61]],Advertencia:[[254,243,199],[180,83,9]],Reclamo:[[254,226,226],[200,30,30]]};
  const boxes=[["Puntaje promedio",fmt1(prom)+" / 5",resAud(prom)],["Excelente",String(cnt("Excelente")),"Excelente"],["Advertencia",String(cnt("Advertencia")),"Advertencia"],["Reclamo",String(cnt("Reclamo")),"Reclamo"],["Infracciones",String(tot),null]];
  const bw=(W-28-4*4)/5;
  boxes.forEach(([k,v,r],i)=>{ const x=14+i*(bw+4), col=RGB[r]||[[236,236,240],[20,20,22]];
    doc.setFillColor(...col[0]); doc.roundedRect(x,36,bw,16,2,2,"F");
    doc.setTextColor(...col[1]); doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.text(k.toUpperCase(), x+3, 41);
    doc.setFontSize(13); doc.text(v, x+3, 48.5); });
  const SRGB={1:[[254,228,226],[217,45,32]],2:[[255,232,217],[232,89,12]],3:[[254,243,199],[161,98,7]],4:[[220,252,231],[22,163,74]],5:[[201,242,217],[14,122,62]]};
  const cortos=["Etiqueta","Estant.","Pedidos","Aviso","Limpieza","Depósito","Otros"];
  doc.autoTable({
    startY:57, theme:"grid", margin:{left:14,right:14,bottom:14},
    head:[["Fecha","Auditor",...cortos,"Prom.","Resultado","Infr.","Checklist","Días ped.","Comentario"]],
    body:[...list].reverse().map(a=>[fmtF(a.fecha),a.auditor,...PUNTOS.map(p=>a.puntajes?.[p.k]??"–"),fmt1(a.promedio),a.resultado,a.totalInfracciones??0,a.resultadoChecklist,a.diasPedido??"–",a.comentarioGeneral||""]),
    styles:{font:"helvetica",fontSize:8,cellPadding:1.8,lineColor:[224,224,230],lineWidth:0.2,textColor:[20,20,22],valign:"middle"},
    headStyles:{fillColor:[17,17,19],textColor:255,fontStyle:"bold",halign:"center"},
    columnStyles:{0:{cellWidth:18},1:{cellWidth:28},9:{halign:"center",fontStyle:"bold"},10:{halign:"center",cellWidth:22},11:{halign:"center"},12:{halign:"center",cellWidth:22},13:{halign:"center"}},
    didParseCell:d=>{ if (d.section!=="body") return; const c=d.column.index, v=d.cell.raw;
      if (c>=2 && c<=8){ d.cell.styles.halign="center"; if (SRGB[v]){ d.cell.styles.fillColor=SRGB[v][0]; d.cell.styles.textColor=SRGB[v][1]; d.cell.styles.fontStyle="bold"; } }
      if ((c===10||c===12) && RGB[v]){ d.cell.styles.fillColor=RGB[v][0]; d.cell.styles.textColor=RGB[v][1]; d.cell.styles.fontStyle="bold"; } },
    didDrawPage:()=>{ doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(130); doc.text(`Hey Blackk · Auditoría Palermo · página ${doc.internal.getNumberOfPages()}`, 14, H-7); }
  });
  return doc.output("blob");
}

async function exportXLSX(){
  const list = filtReg(); if (!list.length) return toast("No hay auditorías para descargar con estos filtros.");
  const st=$("exp-status"); st.textContent="Preparando Excel…";
  try{ await loadLibs("xlsx"); const buf=await buildXLSX(list); st.textContent="";
    guardar(`HeyBlackk_Auditorias_Palermo_${hoy()}.xlsx`, new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); }
  catch(e){ st.textContent=""; toast("No se pudo generar el Excel. Revisá la conexión y probá de nuevo."); }
}
async function exportPDF(){
  const list = filtReg(); if (!list.length) return toast("No hay auditorías para descargar con estos filtros.");
  const st=$("exp-status"); st.textContent="Preparando PDF…";
  try{ await loadLibs("pdf"); const blob=buildPDF(list); st.textContent=""; guardar(`HeyBlackk_Auditorias_Palermo_${hoy()}.pdf`, blob); }
  catch(e){ st.textContent=""; toast("No se pudo generar el PDF. Revisá la conexión y probá de nuevo."); }
}
$("exp-xlsx").addEventListener("click",exportXLSX);
$("exp-pdf").addEventListener("click",exportPDF);
$("exp-sheet").addEventListener("click",async()=>{ try{ const u=await api("hojaUrl",S.jt); if (/^https:\/\/docs\.google\.com\//.test(u)) window.open(u,"_blank","noopener"); }catch(e){ esAuth(e)?lock("La sesión venció."):toast(msgErr(e)); } });
async function copiar(t, ok="Copiado"){ try{ await navigator.clipboard.writeText(t); toast("📋 "+ok); }catch(e){
  const ta=el("textarea",{style:"position:fixed;opacity:0"}); ta.value=t; document.body.append(ta); ta.select(); try{ document.execCommand("copy"); toast("📋 "+ok); }catch(x){ toast("No se pudo copiar: seleccioná el texto a mano."); } ta.remove(); } }

/* ---------- KPI ---------- */
function filtKPI(){
  const d=parseInt($("kf-per").value);
  const lim = d ? (()=>{const x=new Date(); x.setDate(x.getDate()-d); return x.toISOString().slice(0,10);})() : "";
  return S.lista.filter(a=>!lim||a.fecha>=lim);
}
function kpi(k,v,s,c){ return el("div",{class:"kpi "+(c||"")}, el("span",{class:"k",text:k}), el("span",{class:"v",style:c?`color:var(--${c})`:null,text:v}), s?el("span",{class:"s",text:s}):null); }
function renderKPI(){
  const body=$("kpi-body"); body.textContent="";
  const L = filtKPI(), n=L.length, P=S.params;
  $("kpi-lead").textContent = n ? `${n} auditoría${n===1?"":"s"} en el período · datos al momento de desbloquear` : "Sin auditorías en el período";
  if (!n){ body.append(el("div",{class:"card empty",text: S.lista.length ? "No hay auditorías en este período. Probá con «Todo»." : "Los indicadores aparecen con la primera auditoría validada."})); return; }
  const asc=[...L].sort((a,b)=>(a.fecha+a.creado).localeCompare(b.fecha+b.creado));
  const ult=asc[n-1], ant=asc[n-2];
  const prom = L.reduce((s,a)=>s+(a.promedio||0),0)/n;
  const dist={Excelente:0,Advertencia:0,Reclamo:0}; L.forEach(a=>dist[a.resultado]=(dist[a.resultado]||0)+1);
  const totInf = L.reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const lim30=(()=>{const x=new Date(); x.setDate(x.getDate()-30); return x.toISOString().slice(0,10);})();
  const inf30 = S.lista.filter(a=>a.fecha>=lim30).reduce((s,a)=>s+(a.totalInfracciones||0),0);
  const conDias=L.filter(a=>a.diasPedido!=null), maxDias = conDias.length?Math.max(...conDias.map(a=>a.diasPedido)):null;
  const fuera = L.filter(a=>a.diasPedido!=null && a.diasPedido>P.diasMax).length;
  const tend = !ant ? null : ult.promedio>ant.promedio ? "Mejora" : ult.promedio<ant.promedio ? "Empeora" : "Igual";
  const rp=resAud(prom);
  body.append(el("div",{class:"kpis"},
    kpi("⭐ Puntaje promedio", fmt1(prom), "de 5 · "+REMO[rp]+" "+rp, cls(rp)),
    kpi("✅ Auditorías", n, `${pct(dist.Excelente/n)} excelentes`),
    kpi("📅 Última auditoría", fmt1(ult.promedio), `${fmtF(ult.fecha)} · ${ult.resultado}`, cls(ult.resultado)),
    kpi("📈 Tendencia", tend? (tend==="Mejora"?"↑ Mejora":tend==="Empeora"?"↓ Empeora":"= Igual") : "–", ant?`vs ${fmt1(ant.promedio)} el ${fmtF(ant.fecha)}`:"Hace falta una segunda auditoría", tend==="Mejora"?"ok":tend==="Empeora"?"bad":null),
    kpi("🔢 Infracciones", totInf, `${fmt1(totInf/n)} por visita · ${inf30} en 30 días`, totInf?"warn":"ok"),
    kpi("⏳ Pedido más viejo", maxDias==null?"–":maxDias+" días", fuera?`${fuera} visita${fuera===1?"":"s"} fuera de plazo (>${P.diasMax} d)`:`Límite ${P.diasMax} días`, fuera?"bad":(maxDias!=null?"ok":null))));

  const avgP = PUNTOS.map(p=>{ const v=L.map(a=>a.puntajes?.[p.k]).filter(Boolean); return {p, v: v.length? v.reduce((s,x)=>s+x,0)/v.length : null}; });
  const weakest = avgP.filter(x=>x.v!=null).sort((a,b)=>a.v-b.v)[0];
  const bars = el("div",{class:"bars"});
  avgP.forEach(({p,v})=>{ const k=v==null?3:Math.max(1,Math.min(5,Math.round(v)));
    bars.append(el("div",{class:"bar"}, el("span",{text:p.e+" "+p.l}),
      el("div",{class:"track"+(weakest&&weakest.p.k===p.k?" weak":""),title:fmt1(v)}, el("i",{style:`width:${(v||0)/5*100}%;background:var(--s${k})`})),
      el("span",{class:"v",text:fmt1(v)}))); });

  const cat = PUNTOS.map(p=>{ const tot=L.reduce((s,a)=>s+(a.infracciones?.[p.k]||0),0); const vis=L.filter(a=>(a.infracciones?.[p.k]||0)>0).length; return {p,tot,vis}; }).sort((a,b)=>b.tot-a.tot);
  let acum=0; const tbl=el("tbody");
  cat.forEach(c=>{ acum+=c.tot; tbl.append(el("tr",{}, el("td",{text:c.p.e+" "+c.p.inf}), el("td",{class:"n",text:c.tot}), el("td",{class:"n",text:totInf?pct(c.tot/totInf):"–"}),
    el("td",{class:"n",text:totInf?pct(acum/totInf):"–"}), el("td",{class:"n",text:fmt1(c.tot/n)}), el("td",{class:"n",text:pct(c.vis/n)}))); });

  body.append(el("div",{class:"split"},
    el("div",{class:"card"}, el("h3",{text:"⭐ Promedio por punto"}), bars,
      weakest? el("p",{class:"lead",style:"margin:12px 0 0",text:`🎯 Punto más débil: ${weakest.p.l} (${fmt1(weakest.v)}).`}):null),
    el("div",{class:"card"}, el("h3",{text:"🚦 Resultado de las auditorías"}), distBar(dist,n),
      el("h3",{style:"margin-top:18px",text:"📈 Evolución del puntaje"}), chart(asc))));

  body.append(el("div",{class:"card"}, el("h3",{text:"🔢 Infracciones por categoría · Pareto"}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{},el("tr",{}, el("th",{text:"Categoría"}),el("th",{class:"n",text:"Total"}),el("th",{class:"n",text:"% total"}),el("th",{class:"n",text:"% acum."}),el("th",{class:"n",text:"Prom./visita"}),el("th",{class:"n",text:"Recurrencia"}))), tbl)),
    el("p",{class:"lead",style:"margin:10px 0 0",text: totInf? `Problema más frecuente: ${cat[0].p.inf} (${cat[0].tot}).` : "Sin infracciones registradas en el período."})));

  const acc=el("ul",{class:"action"});
  const top = cat.filter(c=>c.tot>0); let cum=0; const pareto=[]; for (const c of top){ pareto.push(c); cum+=c.tot; if (cum/totInf>=0.8) break; }
  const li=(e,t)=>acc.append(el("li",{},el("span",{text:e}),el("span",{text:t})));
  if (pareto.length) li("🎯",`Atacá primero ${pareto.map(c=>c.p.inf.toLowerCase()).join(" y ")}: explican el ${pct(cum/totInf)} de las infracciones. Corregir eso mueve el resultado más que cualquier otra cosa.`);
  if (weakest && weakest.v<P.promExc) li("📌",`Subí ${weakest.p.l.toLowerCase()} de ${fmt1(weakest.v)} a ${fmt1(P.promExc)}: definí un responsable en el local y revisalo en la próxima visita.`);
  if (fuera) li("📦",`${fuera} visita${fuera===1?"":"s"} con pedidos de más de ${P.diasMax} días: cada pedido viejo es plata inmovilizada y un cliente esperando. Pedí aviso diario de pendientes.`);
  if (tend==="Empeora") li("📉",`La última auditoría bajó respecto de la anterior (${fmt1(ant.promedio)} → ${fmt1(ult.promedio)}). Conviene una visita de seguimiento antes de 7 días.`);
  if (!acc.children.length) li("👏","El local está dentro de los parámetros. Mantené la frecuencia de auditoría y reconocé al equipo.");
  body.append(el("div",{class:"card"},el("h3",{text:"✅ Qué hacer ahora"}),acc));
}
function distBar(d,n){
  const wrap=el("div",{style:"display:grid;gap:10px"});
  const bar=el("div",{style:"display:flex;height:16px;border-radius:5px;overflow:hidden;background:var(--chip)"});
  [["Excelente","ok"],["Advertencia","warn"],["Reclamo","bad"]].forEach(([k,c])=>{ if(d[k]) bar.append(el("i",{style:`width:${d[k]/n*100}%;background:var(--${c})`,title:k})); });
  wrap.append(bar, el("div",{class:"row"}, ...[["Excelente","ok"],["Advertencia","warn"],["Reclamo","bad"]].map(([k,c])=>el("span",{class:"pill "+c,text:`${REMO[k]} ${k} ${d[k]||0} · ${pct((d[k]||0)/n)}`}))));
  return wrap;
}
function chart(asc){
  const NS="http://www.w3.org/2000/svg", W=560,H=200,pl=30,pr=12,pt=10,pb=26;
  const s=document.createElementNS(NS,"svg"); s.setAttribute("viewBox",`0 0 ${W} ${H}`); s.setAttribute("role","img"); s.setAttribute("aria-label","Evolución del puntaje promedio por auditoría");
  const mk=(t,a)=>{const e=document.createElementNS(NS,t); for(const k in a) e.setAttribute(k,a[k]); s.append(e); return e;};
  const y=v=>pt+(5-v)/4*(H-pt-pb), pts=asc.slice(-30), x=i=>pts.length===1?(pl+W-pr)/2:pl+i*(W-pl-pr)/(pts.length-1);
  mk("rect",{x:pl,y:y(5),width:W-pl-pr,height:y(S.params.promExc)-y(5),fill:"var(--ok-bg)"});
  mk("rect",{x:pl,y:y(S.params.promExc),width:W-pl-pr,height:y(S.params.promAdv)-y(S.params.promExc),fill:"var(--warn-bg)"});
  mk("rect",{x:pl,y:y(S.params.promAdv),width:W-pl-pr,height:y(1)-y(S.params.promAdv),fill:"var(--bad-bg)"});
  [1,2,3,4,5].forEach(v=>{ mk("line",{x1:pl,x2:W-pr,y1:y(v),y2:y(v),stroke:"var(--line)","stroke-width":1}); mk("text",{x:pl-8,y:y(v)+4,"text-anchor":"end"}).textContent=v; });
  if (pts.length>1) mk("polyline",{points:pts.map((a,i)=>x(i)+","+y(a.promedio)).join(" "),fill:"none",stroke:"var(--ink)","stroke-width":2.2,"stroke-linejoin":"round"});
  pts.forEach((a,i)=>{ const last=i===pts.length-1; const col=`var(--${cls(a.resultado)||"pend"})`; const c=mk("circle",{cx:x(i),cy:y(a.promedio),r:last?6:4,fill:col,stroke:"var(--surface)","stroke-width":2}); const t=document.createElementNS(NS,"title"); t.textContent=`${fmtF(a.fecha)} · ${fmt1(a.promedio)} · ${a.resultado}`; c.append(t); });
  const lab=(i,anchor)=>{ mk("text",{x:x(i),y:H-8,"text-anchor":anchor}).textContent=fmtF(pts[i].fecha).slice(0,5); };
  lab(0, pts.length===1?"middle":"start"); if (pts.length>1) lab(pts.length-1,"end");
  return el("div",{class:"chart"},s);
}



/* ---------- Ajustes ---------- */
function fillAjustes(){ const p=S.params; $("p-promExc").value=p.promExc; $("p-promAdv").value=p.promAdv; $("p-maxInf").value=p.maxInf; $("p-dias").value=p.diasMax; $("p-mExc").value=p.mExc; $("p-mAdv").value=p.mAdv; $("p-mRec").value=p.mRec; }
$("p-save").addEventListener("click", async ()=>{
  const p={ promExc:$("p-promExc").value, promAdv:$("p-promAdv").value, maxInf:$("p-maxInf").value, diasMax:$("p-dias").value, mExc:$("p-mExc").value, mAdv:$("p-mAdv").value, mRec:$("p-mRec").value };
  try{ S.params={...DEF,...await api("setParams",S.jt,p)}; fillAjustes(); onChange(); $("p-ok").hidden=false; setTimeout(()=>$("p-ok").hidden=true,2000); }
  catch(e){ esAuth(e)?lock("La sesión venció."):toast(msgErr(e)); }
});
$("pw-form").addEventListener("submit", async e=>{
  e.preventDefault(); const m=$("pw-msg"); m.hidden=false; m.className="notice"; m.textContent="Guardando…";
  try{
    const n=$("pw-new").value; if (n.length<6) throw new Error("La nueva clave debe tener al menos 6 caracteres."); if (n!==$("pw-new2").value) throw new Error("Las nuevas no coinciden.");
    await api("cambiarClave", S.jt, $("pw-cual").value, $("pw-cur").value, n);
    m.className="notice ok"; m.textContent="Clave actualizada."; ["pw-cur","pw-new","pw-new2"].forEach(i=>$(i).value="");
  }catch(x){ if (esAuth(x)) return lock("La sesión venció."); m.className="notice bad"; m.textContent=msgErr(x); }
});

/* ---------- Eventos ---------- */
document.querySelectorAll(".tab[data-view]").forEach(t=>t.addEventListener("click",()=>show(t.dataset.view)));
$("btn-enviar").addEventListener("click",enviar);
$("btn-copy").addEventListener("click",()=>copiar($("sent-msg").textContent,"Mensaje copiado"));
$("btn-nueva").addEventListener("click",()=>{ $("sent").hidden=true; scrollTo({top:0,behavior:"smooth"}); });
["f-auditor","f-fecha","f-dias","f-general"].forEach(i=>$(i).addEventListener("input",onChange));
["rf-desde","rf-hasta","rf-res","rf-q"].forEach(i=>$(i).addEventListener("input",()=>S.jt&&renderRegistro()));
$("kf-per").addEventListener("input",()=>S.jt&&renderKPI());

(function init(){
  const d=lsGet("hb_draft");
  S.form = d?.form && d.form.inf ? d.form : blankForm();
  $("f-fecha").value = d?.fecha || hoy(); $("f-auditor").value=d?.auditor||""; $("f-dias").value=d?.dias||""; $("f-general").value=d?.gen||"";
  document.querySelectorAll("img.logo").forEach(i=>i.src=LOGO);
  buildPuntos(); renderFotos(); onChange();
  iniciarGate();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  let deferred=null;
  addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferred=e; $("btn-instalar").hidden=false; });
  $("btn-instalar").addEventListener("click", async ()=>{ if(!deferred) return; deferred.prompt(); try{ await deferred.userChoice; }catch(x){} deferred=null; $("btn-instalar").hidden=true; });
})();
})();