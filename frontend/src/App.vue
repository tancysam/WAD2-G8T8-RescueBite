
<script setup>
import { RouterView, RouterLink } from 'vue-router'
</script>

<template>
  <header class="navbar">
    <RouterLink to="/" class="logo">
      RescueBite
    </RouterLink>

    <nav>
      <RouterLink to="/businesses">
        Businesses
      </RouterLink>
    </nav>
  </header>

  <RouterView />
</template>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  background-color: #256b45;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  color: white;
  text-decoration: none;
}

nav a {
  color: white;
  text-decoration: none;
  margin-left: 20px;
}

nav a:hover {
  text-decoration: underline;
}
</style>
