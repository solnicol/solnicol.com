---
layout: default
title: Home
og_title: "Sol Nicol — Builder & engineer"
og_description: "Proving the next decade through ZIGGY, private agent infrastructure, and a DeFi proof-of-work cycle."
og_image: /og.jpg
---

{% assign home = site.data.home %}

<div class="hero">
  <div>
    <p class="hero-kicker">{{ home.hero.kicker }}</p>
    <p class="hero-name">{{ home.hero.name }}</p>
    <p class="hero-intro">{{ home.hero.intro }}</p>
  </div>
</div>

<div class="bio">
  {{ home.bio | markdownify | remove: '<p>' | remove: '</p>' }}
</div>

<h3>Active Builds</h3>

<div class="build-list">
  {% for item in home.builds %}
    <div class="build-item">
      <strong>{{ item.title }}</strong>
      <p>{{ item.description }}</p>
    </div>
  {% endfor %}
</div>

<ul class="links">
  {% for link in home.links %}
    <li><a href="{{ link.url }}">{{ link.label }}</a></li>
  {% endfor %}
</ul>
