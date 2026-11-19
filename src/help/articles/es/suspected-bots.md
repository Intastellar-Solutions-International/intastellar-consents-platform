---
title: Bots sospechosos
summary: Qué cuenta como bot, por qué se excluye por defecto y cómo incluirlo.
tags: bots, rastreador, centro de datos, filtro
---
Los rastreadores y las comprobaciones automáticas también visitan tu web. Si se cuentan como visitantes, el tráfico parece mayor y la tasa de consentimiento menor de lo que es; por eso ambos productos los excluyen por defecto.

## Qué cuenta como bot sospechoso

- **CMP:** registros de consentimiento de direcciones IP de alojamiento o centros de datos.
- **Analytics:** una visita desde una IP de centro de datos **que nunca dio el consentimiento completo**. Los rastreadores (en Google, AWS, Tencent y similares) nunca aceptan el banner. Las personas tras una VPN o iCloud Private Relay a menudo sí: aceptar es una acción humana, así que esas visitas siguen contando.

## Un solo interruptor para ambos productos

Es una sola preferencia, activada por defecto, y cambiarla en un sitio la cambia en todos:

- **CMP:** el interruptor **Excluir bots sospechosos** en la parte superior de Inicio, Cumplimiento y el registro de auditoría.
- **Inicio de Analytics:** **Incluir bots / Excluir bots** en la línea bajo el gráfico.
- **Vista en directo:** **Mostrarlos / Ocultarlos** bajo el gráfico de actividad, con el número de visitas ocultas.

> Los eventos personalizados y los clics no se filtran: esos registros no guardan el tipo de red. Los bots rara vez los generan.
