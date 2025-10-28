# be-stage-2

HNG 13 Stage 2 Backend - Build a RESTful API that fetches country data from an external API, stores it in a database, and provides CRUD operations.

## Getting Started

To get started with the repository, follow these steps:

1. Clone the repository:

```bash
git clone https://github.com/tundealabi/hng13-be-stage-2.git
```

2. Change into the project directory:

```bash
cd hng13-be-stage-2
```

3. Add ENVs:

```bash
cp .env.example .env
```

Then, update the `.env` file with your desired configuration values.

4. Install the dependencies:

```bash
yarn
```

5. Start the Node JS server:

```bash
npm start | yarn start
```

## 📜 Endpoint

### `/countries`(GET) - Get all countries from the DB (support filters and sorting) - ?region=Africa | ?currency=NGN | ?sort=gdp_desc

### `/countries/refresh`(POST) - Fetch all countries and exchange rates, then cache them in the database

### `/countries/image`(GET) - Serve summary image

### `/countries/{name}`(GET) - Get one country by name

### `/countries/{name}`(DELETE) - Delete a country record

### `/status`(GET) - Show total countries and last refresh timestamp

## 💻 Built with

Technologies used in the project:

- Javascript/Node Js - <https://hng.tech/hire/nodejs-developers>
