# Features

REST API for PostGIS

## Configuration
```json
{
  "port": 8080,
  "users": {
    "transportation": {
      "type": "postgres",
      "auth": {
        "secret": "longrandomstring",
        "issuer": "example.com"
      },
      "options": {
        "user": "web",
        "host": "gis.example.com",
        "database": "mpo",
        "password": "abc123",
        "port": 5432,
        "ssl": {},
        "defaultSrid": 3435
      }
    }
  }
}
```

## Usage
```
TOKEN=`npm run --silent token transportation 604800`

npm start

curl -X GET http://localhost:8080/transportation/traffic.volumes_2015 \
     --header "Authorization: Bearer $TOKEN"
```
