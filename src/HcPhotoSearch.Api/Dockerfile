# Build Stage
# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj and restore as distinct layers
# Copy csproj and restore as distinct layers
COPY ["HcPhotoSearch.Api/HcPhotoSearch.Api.csproj", "HcPhotoSearch.Api/"]
COPY ["HcPhotoSearch.Shared/HcPhotoSearch.Shared.csproj", "HcPhotoSearch.Shared/"]
RUN dotnet restore "HcPhotoSearch.Api/HcPhotoSearch.Api.csproj"

# Copy everything else and build
COPY . .
RUN dotnet publish "HcPhotoSearch.Api/HcPhotoSearch.Api.csproj" -c Release -o /app/publish

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8081
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "HcPhotoSearch.Api.dll"]
