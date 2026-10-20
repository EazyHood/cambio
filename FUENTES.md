# Fuentes técnicas de CAMBIO

Fecha: 19 de octubre de 2026. Código del motor y del worker creado para este proyecto durante la ventana de DEV Week 3; no copiado de entregas anteriores.

| Recurso | Fuente primaria | Versión y licencia |
| --- | --- | --- |
| Modelo de embeddings | https://huggingface.co/Xenova/all-MiniLM-L6-v2 | Revisión `751bff37182d3f1213fa05d7196b954e230abad9`, ONNX q8; Apache-2.0 según ficha y registro de la caché existente. |
| Modelo original | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 | Modelo de similitud semántica, no generador de instrucciones; Apache-2.0. |
| Runtime | https://www.npmjs.com/package/@huggingface/transformers/v/3.8.1 | `@huggingface/transformers` fijado a `3.8.1`; Apache-2.0. |
| Herramienta de compilación | https://www.npmjs.com/package/vite/v/7.1.7 | Vite fijado a `7.1.7`; MIT. Requiere Node 20.19+ o 22.12+; este proyecto exige 22.12+. |

## Modelo y reproducción

La evaluación reutilizó una copia local previa, sin modificarla ni descargar pesos duplicados. El peso `onnx/model_quantized.onnx` tiene 22.972.370 bytes y SHA-256 `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`. El evaluador comprobó los hashes antes y después de las ejecuciones; ver `evaluation/README.md` y sus manifiestos.

En navegador, el worker solicita los archivos públicos de la revisión fijada de Hugging Face y puede conservarlos en la caché del navegador. El texto de las listas se entrega al modelo WASM local; no se usa una API de inferencia remota. La primera carga requiere red para esos recursos. No se promete recarga de la aplicación completa sin conexión.

Para volver a obtener exactamente el modelo, utilizar `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/751bff37182d3f1213fa05d7196b954e230abad9/` con `config.json`, `tokenizer.json`, `tokenizer_config.json` y `onnx/model_quantized.onnx`, respetando su licencia. Reutilizar una caché existente cuando esté disponible. Las dependencias se instalan desde el registro npm mediante el lockfile. Las rutas portables de evaluación se explican en `evaluation/README.md`.

## Límites del motor

La similitud coseno solo ordena candidatos. Los umbrales `0.45` y `0.08`, las tres sugerencias máximas y las señales léxicas de negación/condición se fijaron antes de la evaluación independiente. No son probabilidades ni garantizan equivalencia. Solo una decisión explícita incorpora texto de una fuente; el motor no sintetiza frases, no fusiona instrucciones y no ejecuta su contenido.
