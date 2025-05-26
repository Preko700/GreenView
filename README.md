# GreenView 🌿

[![TypeScript](https://img.shields.io/badge/TypeScript-98.1%25-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![CSS](https://img.shields.io/badge/CSS-1.2%25-1572B6?style=flat-square&logo=css3)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![License](https://img.shields.io/github/license/Preko700/GreenView?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/Preko700/GreenView?style=flat-square)](https://github.com/Preko700/GreenView/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Preko700/GreenView?style=flat-square)](https://github.com/Preko700/GreenView/commits/main)

## 📋 Overview

GreenView es una moderna aplicación web diseñada para ayudar a los usuarios a monitorear y visualizar datos ambientales. Desarrollada con TypeScript y tecnologías web modernas, GreenView proporciona una interfaz intuitiva para seguimiento de métricas de sostenibilidad, indicadores ambientales e iniciativas ecológicas.

## ✨ Features

- **Monitoreo Ambiental en Tiempo Real**: Seguimiento de métricas ambientales clave en tiempo real
- **Tableros Interactivos**: Visualización de datos a través de gráficos personalizables e interactivos
- **Responsive para Dispositivos Móviles**: Acceso a tus datos ambientales desde cualquier dispositivo
- **Exportación de Datos**: Descarga de informes y datos en múltiples formatos
- **Autenticación de Usuarios**: Acceso seguro a tus datos ambientales
- **Alertas Personalizables**: Configuración de umbrales y recepción de notificaciones

## 🚀 Getting Started

### Prerequisitos

- Node.js (v16.0 o superior)
- npm o yarn

### Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/Preko700/GreenView.git
   cd GreenView
   ```

2. Instala las dependencias:
   ```bash
   npm install
   # o
   yarn install
   ```

3. Crea un archivo `.env` basado en `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   # o
   yarn dev
   ```

5. Abre tu navegador y navega a `http://localhost:3000`

## 💻 Technologies Used

- **Frontend**:
  - TypeScript
  - React
  - CSS/SCSS
  - Chart.js para visualización de datos

- **Backend**:
  - Node.js con Express
  - TypeScript
  - Firebase y SQLite (o tu base de datos preferida)

- **DevOps & Herramientas**:
  - Docker
  - GitHub Actions para CI/CD
  - Jest para testing

## 📐 System Design

### Arquitectura del Software

La arquitectura de GreenView está diseñada para proporcionar una experiencia de usuario fluida con un rendimiento óptimo y una alta escalabilidad.

![Arquitectura GreenView](Arquitectura%20Greenview.png)

La arquitectura sigue un modelo de capas bien definidas:
- **Capa Frontend**: Implementada con React y TypeScript, maneja la interfaz de usuario y la interacción del usuario.
- **Capa Backend**: Basada en Node.js y TypeScript, procesa las solicitudes y gestiona la lógica de negocio.
- **Capa de Datos**: Almacena y recupera información de las bases de datos y caché.
- **Servicios Externos**: Integración con servicios de autenticación, notificaciones y APIs de datos ambientales.

### Modelo de Clases

El siguiente diagrama UML muestra las principales entidades del sistema y sus relaciones:

![UML GreenView](UML%20Greenview.png)

Este modelo de clases representa las entidades clave de GreenView:
- **Usuario**: Gestiona los perfiles de usuario y sus preferencias
- **MacetaInteligente**: Representa el dispositivo físico con sus sensores y actuadores
- **Ventilador**: Componente para gestionar la circulación del aire
- **SistemaSensores**: Maneja la recolección de datos ambientales
- **DatosSensores**: Almacena las mediciones de los sensores
- **Alerta**: Notifica sobre condiciones que requieren atención

## 📈 Project Structure

```
GreenView/
├── src/                # Archivos fuente
│   ├── components/     # Componentes React
│   ├── hooks/          # Custom React hooks
│   ├── pages/          # Páginas de la aplicación
│   ├── services/       # Servicios API
│   ├── types/          # Definiciones de tipos TypeScript
│   ├── utils/          # Funciones de utilidad
│   └── App.tsx         # Componente principal de la aplicación
├── public/             # Archivos estáticos
├── tests/              # Archivos de test
├── docs/               # Documentación
│   ├── assets/         # Recursos e imágenes
│   └── diagrams/       # Diagramas del sistema
├── .env.example        # Variables de entorno de ejemplo
├── tsconfig.json       # Configuración de TypeScript
└── package.json        # Dependencias del proyecto
```

## 🤝 Contributing

¡Las contribuciones son bienvenidas! No dudes en enviar un Pull Request.

1. Fork del repositorio
2. Crea tu rama de funcionalidad (`git checkout -b feature/amazing-feature`)
3. Haz commit de tus cambios (`git commit -m 'Add some amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📄 License

Este proyecto está licenciado bajo la Licencia MIT - consulta el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Contact

- **Desarrollador**: [Adrián Monge Mairena](https://github.com/Preko700)
- **Link del Proyecto**: [https://github.com/Preko700/GreenView](https://github.com/Preko700/GreenView)

## 🙏 Acknowledgments

- Todos los colaboradores que han ayudado en este proyecto
- Librerías open source utilizadas
- Proveedores de datos ambientales

---

<p align="center">Hecho con ❤️ para un futuro más verde</p>
