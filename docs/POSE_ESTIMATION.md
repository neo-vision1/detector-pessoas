# Estimativa de pose e identificação de quedas

## Visão geral

O detector agora mantém a detecção de pessoas e executa um segundo estágio leve de **estimativa de pose** sobre cada caixa encontrada. Esse estágio utiliza o **MoveNet Lightning** no navegador, modelo do ecossistema TensorFlow.js que retorna 17 pontos corporais e foi projetado para inferência em tempo real [1].

> **Importante:** a implementação atual do projeto usa `COCO-SSD lite_mobilenet_v2` para detectar pessoas; apesar de a interface histórica mencionar “YOLOv8 Nano”, esse pacote não é um modelo YOLO. Por isso, a caixa de pessoa existente não contém keypoints por si só. O MoveNet foi integrado sobre essas caixas para entregar pose sem substituir imediatamente o detector e sem aumentar o custo de uma inferência de cena completa.

A pose é atualizada aproximadamente cinco vezes por segundo. Entre essas atualizações, o último resultado é reutilizado enquanto o rastreador continua processando os frames. Cada pessoa é recortada para uma imagem de 192 × 192 pixels antes da inferência, e no máximo oito caixas são processadas em uma rodada para limitar o impacto sobre o FPS.

## Classificação de postura

A classificação atual é geométrica e conservadora. O sistema verifica a posição relativa de ombros, quadril, joelhos e tornozelos, além da razão entre largura e altura do conjunto de keypoints. Quando a cadeia corporal está predominantemente vertical, a postura recebe o estado **Em pé**. Quando o corpo ocupa uma configuração predominantemente horizontal ou a cadeia inferior perde o alinhamento esperado, recebe **Caída**. Se poucos pontos têm confiança suficiente, o estado permanece **Desconhecido**.

| Estado | Comportamento visual |
|---|---|
| `standing` | O box permanece com a cor normal e recebe o rótulo `EM PÉ`. |
| `fallen` | O box fica vermelho, recebe o rótulo `CAÍDA` e aparece um alerta global. |
| `unknown` | O rastreamento continua, mas o sistema não afirma uma postura. |

A indicação **“Possível queda”** não é diagnóstico médico nem confirmação definitiva de acidente. Uma pessoa deitada voluntariamente, agachada, parcialmente ocluída ou vista em perspectiva extrema pode produzir o mesmo padrão geométrico. Para operação de segurança, o alerta deve ser validado por um operador ou por uma regra temporal que exija vários frames consecutivos.

## Desempenho e evolução para YOLO Pose

A solução atual foi escolhida para preservar a estabilidade do detector no navegador e reduzir o risco de trocar o pipeline de contagem já validado. Um modelo YOLO de pose, como os modelos de pose documentados pela Ultralytics, também pode retornar caixas e keypoints em uma única inferência [2]. Entretanto, sua execução no navegador exigiria exportação para ONNX ou TensorFlow.js, pós-processamento específico e uma nova validação de desempenho, memória e compatibilidade de codecs.

Portanto, há duas rotas futuras. A rota de menor risco é manter COCO-SSD para caixas e MoveNet para pose, que é a implementação atual. A rota de unificação é substituir o detector por um modelo **YOLO Pose Nano** exportado para WebGPU/WASM, eliminando a dupla inferência, mas exigindo uma migração técnica maior. A segunda rota pode ser feita posteriormente caso a medição no Windows mostre que o custo do MoveNet por pessoa ainda é alto.

## Referências

[1]: https://github.com/tensorflow/tfjs-models/tree/master/pose-detection "TensorFlow.js Pose Detection — MoveNet, BlazePose e PoseNet"

[2]: https://docs.ultralytics.com/tasks/pose/ "Ultralytics — Pose estimation"
