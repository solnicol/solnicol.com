---
layout: default
title: Home
og_title: "Sol Nicol — Builder & engineer"
og_description: "Fifteen years in institutional asset management. Currently building private agentic infrastructure and mapping the decentralised finance landscape for Blockchain Scotland."
og_image: /og.jpg
---

{% assign home = site.data.home %}

<div class="bio">
  {{ home.hero.intro | markdownify | remove: '<p>' | remove: '</p>' }}
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
