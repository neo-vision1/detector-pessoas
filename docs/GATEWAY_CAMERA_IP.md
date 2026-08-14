# Gateway seguro para câmera IP Intelbras

Este projeto usa um gateway local para manter a câmera Intelbras VIP 1300 MINI SD dentro da rede privada e entregar ao navegador somente o stream HLS por HTTPS. A câmera suporta RTSP, ONVIF, HTTP/HTTPS, RTP/RTCP e os codecs H.265, H.264 e MJPEG; o MJPEG está disponível apenas no stream extra [1]. Como navegadores podem ter limitações com H.265 em WebRTC, recomenda-se configurar o stream usado pelo gateway como **H.264** [2].

> **Princípio de segurança:** o endereço RTSP e a senha da câmera ficam exclusivamente no arquivo `.env` do gateway local. O navegador recebe apenas uma URL HTTPS do gateway e, opcionalmente, credenciais individuais de leitura.

## Arquitetura

O equipamento ligado 24 horas na mesma rede da câmera executa o MediaMTX e o Caddy. O MediaMTX puxa o RTSP pela rede local, e o Caddy publica somente o caminho HTTPS `/camera/`. O painel usa HLS.js para ler `index.m3u8` e continuar processando os frames no canvas, mantendo as linhas, zonas e contagens já existentes.

| Componente | Responsabilidade | Exposição recomendada |
|---|---|---|
| Câmera Intelbras | Fornece o RTSP local | Somente rede local |
| MediaMTX | Faz proxy RTSP e gera HLS | Apenas rede Docker/local |
| Caddy | Termina HTTPS e encaminha `/camera/*` | Portas 80/443 |
| Detector de pessoas | Lê HLS e executa YOLOv8 Nano | Usuários autenticados |

O MediaMTX documenta que um stream HLS pode ser lido pelo navegador por uma página HTTP e que a playlist técnica usa o caminho `index.m3u8` [3]. A documentação também descreve a autenticação por usuário/senha, a autenticação externa e o uso de credenciais individuais para a leitura [4].

## Instalação no equipamento local

Instale Docker e Docker Compose no computador, mini-PC ou servidor que ficará ligado na mesma rede da câmera. Em seguida, copie o arquivo de exemplo:

```bash
cd gateway
cp .env.example .env
```

Edite o `.env` e substitua todos os valores de exemplo. O valor `CAMERA_RTSP_URL` deve ser o endereço RTSP obtido no manual ou na interface web da câmera. Não coloque essas credenciais no código do frontend, em issues ou no GitHub.

Configure `STREAM_DOMAIN` com um domínio que apontará para o endereço público do gateway, por exemplo `stream.seudominio.com`. Configure `APP_ORIGIN` com o endereço HTTPS do painel do detector. Os valores `STREAM_USER_1` e `STREAM_USER_2` são usuários de **leitura do stream**, não são a conta administrativa da câmera. Para adicionar mais usuários, acrescente entradas de autenticação no `docker-compose.yml` ou substitua a autenticação interna por um provedor JWT/HTTP.

Suba o gateway:

```bash
docker compose up -d

docker compose logs -f mediamtx caddy
```

O Caddy solicitará automaticamente um certificado TLS válido para o domínio quando o DNS e o encaminhamento de portas estiverem corretos. O endereço a ser informado no botão **Câmera IP** do software será:

```text
https://stream.seudominio.com/camera/intelbras/index.m3u8
```

O endpoint oficial do MediaMTX para leitura HLS utiliza o formato `http://host:8888/nome-do-stream/index.m3u8`; neste projeto, o Caddy apenas acrescenta o prefixo HTTPS `/camera/` [3].

## Rede e acesso remoto

Para o acesso remoto convencional, crie um registro DNS apontando `stream.seudominio.com` para o endereço público do local e encaminhe somente as portas TCP 80 e 443 do roteador para o Caddy. **Não encaminhe a porta RTSP 554, as portas do MediaMTX ou a porta de controle da câmera.** O HLS usa HTTP e tende a apresentar maior latência que WebRTC, mas é normalmente mais simples de atravessar firewalls e NAT [5].

Se o provedor não oferecer IP público ou o roteador não permitir encaminhamento de portas, use um túnel HTTPS de saída no equipamento local, como uma solução de túnel autenticada. Nesse caso, não será necessário abrir portas de entrada, mas o túnel deverá permanecer ativo junto com o gateway.

## Configuração no painel

Abra o botão **Câmera IP** no cabeçalho e informe a URL HLS pública. Para autenticação, informe o usuário e a senha de leitura definidos no gateway. O componente envia essas credenciais somente no cabeçalho HTTP Basic das requisições HLS; elas não são incorporadas à URL.

O navegador precisa acessar o painel e o stream por HTTPS. Se o painel estiver em `https://app.seudominio.com` e o stream em `https://stream.seudominio.com`, o valor de `APP_ORIGIN` precisa ser exatamente `https://app.seudominio.com` para que o CORS do MediaMTX aceite as requisições do player.

## Boas práticas para vários usuários

Crie um usuário de leitura separado para cada pessoa, com senha diferente e sem reutilizar a senha administrativa da câmera. Esta implementação protege o **stream da câmera** com credenciais individuais. Se o painel do detector também ficar público na internet, ele deverá ser publicado atrás de um mecanismo próprio de autenticação, SSO ou VPN; o gateway não deve ser tratado como substituto da autenticação da aplicação. Revogue o usuário quando a pessoa deixar de ter acesso. Mantenha o `.env` fora de backups públicos e proteja o computador local com atualização automática, firewall e senha de sistema.

A configuração usa `sourceOnDemand`, de modo que o MediaMTX puxa a câmera somente quando há um leitor conectado. Isso reduz tráfego e uso de recursos quando nenhum usuário está visualizando o stream; essa opção é suportada pela configuração oficial do MediaMTX [6].

## Otimização de latência

A configuração do gateway agora usa Low-Latency HLS com playlist curta e remux contínuo. O MediaMTX documenta que `hlsVariant: lowLatency`, `hlsPartDuration` e `hlsAlwaysRemux` podem ser usados para ajustar a geração do HLS [7]. O player HLS.js também é configurado para iniciar próximo ao live edge, limitar o buffer e reposicionar automaticamente quando a latência estimada ultrapassar quatro segundos [8].

| Parâmetro | Valor aplicado | Objetivo |
|---|---:|---|
| `hlsVariant` | `lowLatency` | Usar Low-Latency HLS. |
| `hlsAlwaysRemux` | `true` | Evitar espera extra para preparar o muxer após a solicitação. |
| `hlsSegmentCount` | `3` | Manter uma playlist curta. |
| `hlsSegmentDuration` | `1s` | Limitar a duração-alvo dos segmentos. |
| `hlsPartDuration` | `100ms` | Permitir partes menores no modo de baixa latência. |
| `lowLatencyMode` do hls.js | `true` | Fazer o navegador perseguir o live edge. |

A duração efetiva dos segmentos ainda depende do intervalo de quadros-chave/I-frames enviados pela câmera. Configure o stream da Intelbras como **H.264** e, se o firmware disponibilizar a opção, use intervalo de I-frame próximo de um segundo. Para o detector, o substream `subtype=1` em resolução e FPS moderados costuma reduzir o tráfego e o tempo de processamento.

## Limitações conhecidas

A integração incluída no painel espera HLS porque o vídeo precisa chegar ao navegador para que o detector possa copiar cada frame para o canvas. A implementação não aceita `rtsp://` diretamente no campo da interface. HLS continua tendo mais latência que WebRTC, embora seja normalmente mais simples de atravessar firewalls e NAT [5]. Se a latência mínima possível for requisito crítico, a próxima evolução arquitetural é entregar WebRTC/WHEP ao navegador e preservar HLS como fallback.

As configurações de baixa latência também precisam ser aplicadas ao `mediamtx.yml` quando o MediaMTX é executado diretamente no Windows, conforme o roteiro de teste local.

## Referências

[1]: https://backend.intelbras.com/sites/default/files/2026-06/Datasheet%20VIP%201300%20MINI%20SD%20%28V10%29_0.pdf "Intelbras VIP 1300 MINI SD — ficha técnica oficial"

[2]: https://mediamtx.org/docs/features/webrtc-specific-features "MediaMTX — WebRTC-specific features e compatibilidade de codecs"

[3]: https://mediamtx.org/docs/read/hls "MediaMTX — leitura HLS"

[4]: https://mediamtx.org/docs/features/authentication "MediaMTX — autenticação"

[5]: https://mediamtx.org/docs/read/web-browsers "MediaMTX — leitura em navegadores"

[6]: https://mediamtx.org/docs/references/configuration-file "MediaMTX — referência do arquivo de configuração"

[7]: https://mediamtx.org/docs/references/configuration-file "MediaMTX — parâmetros HLS de baixa latência"

[8]: https://github.com/video-dev/hls.js/blob/master/docs/API.md "hls.js — API e configurações de live streaming"
