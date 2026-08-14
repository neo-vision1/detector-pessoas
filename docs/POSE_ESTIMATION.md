# Estimativa de pose e identificação de quedas

## Visão geral

O detector mantém o `COCO-SSD lite_mobilenet_v2` para localizar pessoas e executa um segundo estágio leve de **estimativa de pose** sobre o frame completo. Esse estágio utiliza o **MoveNet MultiPose Lightning**, que retorna até seis poses no mesmo frame e 17 keypoints corporais por pessoa [1].

> **Importante:** a implementação histórica do projeto menciona “YOLOv8 Nano”, mas o pacote atualmente usado para localizar pessoas é o COCO-SSD. Uma caixa de detecção, por si só, não contém pontos corporais. O MoveNet foi integrado para entregar os keypoints sem substituir imediatamente o detector e sem comprometer o pipeline de contagem já validado.

A configuração usa `multiPoseMaxDimension: 192`, suavização interna e rastreamento do próprio MoveNet. A detecção COCO-SSD roda em aproximadamente 5,5 Hz, ou 3,8 Hz quando o FPS já está baixo. A pose é executada por intervalo adaptativo, aproximadamente duas vezes por segundo com uma pessoa e 1,5 vez por segundo com várias pessoas; nos frames intermediários, o último resultado é reutilizado. As trilhas de movimento não são mais desenhadas e o histórico visual do rastreador foi reduzido para quatro pontos. O processamento continua limitado pelo retorno multipose do modelo, que suporta até seis pessoas, evitando uma chamada de pose separada para cada caixa.

## Keypoints visíveis

O skeleton é desenhado diretamente sobre cada pessoa detectada. Os círculos representam os pontos com confiança suficiente e as linhas representam as conexões corporais. Os textos individuais de cada ponto e a etiqueta da razão corporal foram removidos para reduzir o custo de renderização. A razão continua sendo calculada internamente para a classificação.

| Abreviação | Região |
|---|---|
| Pontos visíveis | Ombros, quadril, joelhos, tornozelos, cotovelos, pulsos e nariz |
| Skeleton | Linhas conectando as articulações com confiança suficiente |
| Razão corporal | Calculada internamente para classificar a postura, sem texto adicional na tela |

A razão corporal é calculada entre a largura e a altura do conjunto de keypoints visíveis. Uma razão maior indica uma configuração mais horizontal, mas ela não é usada isoladamente porque perspectiva, oclusão e enquadramento alteram a medida.

## Classificação de postura

A classificação combina a razão largura/altura dos keypoints, a razão largura/altura do box, o ângulo do eixo ombro–quadril, a ordem vertical entre quadril, joelhos e tornozelos e a confiança mínima dos pontos. Se o MoveNet não associar um skeleton, a razão do box horizontal é usada como fallback. Quando os sinais indicam uma cadeia corporal predominantemente vertical, o estado é **Em pé**. Quando o corpo ocupa uma configuração predominantemente horizontal ou perde a ordem anatômica esperada, o estado é **Caída**. Se poucos keypoints têm confiança suficiente, o estado permanece **Desconhecido**.

A classificação não muda por causa de um único frame. O rastreador mantém um histórico de até quatro resultados por ID e exige pelo menos dois votos coerentes antes de estabilizar `EM PÉ` ou `CAÍDA`. Isso reduz oscilações, mas também significa que uma transição muito rápida pode aparecer com um pequeno atraso visual.

| Estado | Comportamento visual |
|---|---|
| `standing` | Box na cor normal, skeleton visível e rótulo `EM PÉ`. |
| `fallen` | Box vermelho, skeleton destacado, rótulo `CAÍDA` e alerta global. |
| `unknown` | Keypoints podem aparecer, mas o sistema não afirma uma postura. |

A indicação **“Possível queda”** não é diagnóstico médico nem confirmação definitiva de acidente. A heurística horizontal do box é um fallback para situações em que o skeleton não foi associado, não uma prova isolada de queda. Uma pessoa deitada voluntariamente, agachada, parcialmente ocluída ou vista em perspectiva extrema pode produzir o mesmo padrão geométrico. Para uso de segurança, o alerta deve ser validado por um operador ou complementado por uma regra temporal de permanência no chão.

## Desempenho e evolução para YOLO Pose

A escolha do MoveNet MultiPose preserva a otimização atual porque evita uma inferência de pose separada para cada pessoa. O detector principal continua responsável por caixas, linhas, zonas e rastreamento; o MoveNet é executado em baixa frequência e os resultados são reutilizados nos demais frames.

Um modelo YOLO de pose poderia retornar caixas e keypoints em uma única inferência [2]. Entretanto, sua execução no navegador exigiria exportação para ONNX ou TensorFlow.js, pós-processamento específico e nova validação de memória, WebGL/WebGPU e desempenho. Por isso, a migração para YOLO Pose Nano fica como opção posterior caso a medição real no Windows mostre que o pipeline combinado ainda não atende ao FPS desejado.

## Referências

[1]: https://github.com/tensorflow/tfjs-models/tree/master/pose-detection/src/movenet/README.md "TensorFlow.js Pose Detection — MoveNet MultiPose"

[2]: https://docs.ultralytics.com/tasks/pose/ "Ultralytics — Pose estimation"
