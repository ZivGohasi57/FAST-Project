FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q 2>/dev/null || true
COPY src/ src/
RUN mvn package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/fast-routing-1.0-SNAPSHOT.jar app.jar
COPY export.osm .
EXPOSE 8082
CMD ["java", "-Xmx400m", "-jar", "app.jar"]
